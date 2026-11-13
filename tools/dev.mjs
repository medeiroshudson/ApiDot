#!/usr/bin/env node

/**
 * Starts local development processes with prefixed output.
 *
 * Tauri's beforeDevCommand runs the Next dev server, so the `desktop` target
 * only needs the backend alongside it. `API_BASE_URL` points the frontend at
 * the backend; override the host with APIDOT_API_BASE when the API runs
 * elsewhere (for example a compose backend on :5001).
 *
 * Usage: node tools/dev.mjs [--dry-run] <backend|frontend|desktop>...
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter((arg) => !arg.startsWith('--'));
const defaultApiPort = 5181;
const apiBase = (process.env.APIDOT_API_BASE || `http://127.0.0.1:${defaultApiPort}`).replace(/\/+$/, '');

/** Resolves true once the API answers /health, false on timeout. */
function waitForApi(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  const probe = () =>
    new Promise((resolve) => {
      const request = http.get(`${apiBase}/health`, { timeout: 2000 }, (response) => {
        response.resume();
        resolve(response.statusCode !== undefined);
      });
      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });
      request.on('error', () => resolve(false));
    });

  return (async () => {
    while (Date.now() < deadline) {
      if (await probe()) return true;
      if (shuttingDown) return false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  })();
}

/** True when something already accepts connections on the local backend port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const services = {
  backend: {
    command: 'dotnet',
    args: ['watch', '--project', 'backend/src/ApiDot.Server', 'run'],
    env: { ASPNETCORE_URLS: `http://127.0.0.1:${defaultApiPort}` },
  },
  frontend: {
    command: 'npm',
    args: ['--prefix', 'frontend', 'run', 'dev'],
    env: { API_BASE_URL: apiBase },
  },
  desktop: {
    command: 'npm',
    args: ['--prefix', 'desktop', 'run', 'dev'],
    env: { API_BASE_URL: apiBase, NEXT_PUBLIC_APIDOT_API_BASE: apiBase },
  },
};

const known = Object.keys(services);
const unknown = targets.filter((target) => !services[target]);

if (targets.length === 0 || unknown.length > 0) {
  console.error(`Usage: node tools/dev.mjs [--dry-run] <${known.join('|')}>...`);
  process.exit(1);
}

if (dryRun) {
  for (const target of targets) {
    const { command, args: commandArgs, env } = services[target];
    const envText = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    console.log(`[dry-run] ${target}: ${envText ? `${envText} ` : ''}${command} ${commandArgs.join(' ')}`);
  }
  process.exit(0);
}

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function prefixLines(stream, label) {
  readline.createInterface({ input: stream }).on('line', (line) => {
    console.log(`[${label}] ${line}`);
  });
}

function exitWhenDone() {
  const timer = setInterval(() => {
    const running = [...children.values()].some(
      ({ child }) => child.exitCode === null && child.signalCode === null
    );
    if (!running) {
      clearInterval(timer);
      process.exit(exitCode);
    }
  }, 100);
}

function signalGroup({ child }, signal) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const entry of children.values()) {
    signalGroup(entry, 'SIGTERM');
  }
  exitWhenDone();
  setTimeout(() => {
    for (const entry of children.values()) {
      signalGroup(entry, 'SIGKILL');
    }
    process.exit(exitCode);
  }, 3000).unref();
}

if (targets.includes('backend') && (await portInUse(defaultApiPort))) {
  console.error(`[backend] port ${defaultApiPort} is already in use, most likely a dev run that never exited.`);
  console.error(`[backend] stop it first: lsof -ti tcp:${defaultApiPort} | xargs kill`);
  process.exit(1);
}

const spawnsBackend = targets.includes('backend');
const uiTargets = targets.filter((target) => target !== 'backend');

for (const target of targets) {
  if (spawnsBackend && target !== 'backend' && uiTargets[0] === target) {
    // The app boots as soon as the dev server answers; starting it before the API
    // is listening leaves the first screen on a network error.
    console.log(`[${target}] waiting for the API at ${apiBase} ...`);
    if (!(await waitForApi())) {
      console.error(`[${target}] the API did not answer /health in time; starting anyway.`);
    }
  }

  const { command, args: commandArgs, env } = services[target];
  console.log(`[${target}] starting: ${command} ${commandArgs.join(' ')}`);
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group: dotnet watch spawns the server as a grandchild, which a
    // plain kill would leave holding the port.
    detached: process.platform !== 'win32',
  });
  children.set(target, { child });
  prefixLines(child.stdout, target);
  prefixLines(child.stderr, target);

  child.on('exit', (code, signal) => {
    children.delete(target);
    exitCode = code ?? (signal ? 1 : 0);
    if (!shuttingDown) {
      console.error(`[${target}] exited (${signal ?? `code ${exitCode}`}); stopping the others.`);
      shutdown();
      return;
    }
    if (children.size === 0) {
      process.exit(exitCode);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, shutdown);
}

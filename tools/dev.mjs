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
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter((arg) => !arg.startsWith('--'));
const apiBase = (process.env.APIDOT_API_BASE || 'http://127.0.0.1:5000').replace(/\/+$/, '');

const services = {
  backend: {
    command: 'dotnet',
    args: ['watch', '--project', 'backend/src/ApiDot.Server', 'run'],
    env: { ASPNETCORE_URLS: 'http://127.0.0.1:5000' },
  },
  frontend: {
    command: 'npm',
    args: ['--prefix', 'frontend', 'run', 'dev'],
    env: { API_BASE_URL: apiBase },
  },
  desktop: {
    command: 'npm',
    args: ['--prefix', 'desktop', 'run', 'dev'],
    env: { API_BASE_URL: apiBase },
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

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children.values()) {
    child.kill('SIGTERM');
  }
  exitWhenDone();
  setTimeout(() => process.exit(exitCode), 3000).unref();
}

for (const target of targets) {
  const { command, args: commandArgs, env } = services[target];
  console.log(`[${target}] starting: ${command} ${commandArgs.join(' ')}`);
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, shutdown);
}

#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const targetUrl = 'http://localhost:3000';

function checkExistingServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const isRunning = await checkExistingServer(targetUrl);
  if (isRunning) {
    console.log(`✓ Web frontend already running on ${targetUrl} (Docker Compose or active dev server). Reusing.`);
    // Mantém o processo vivo para o Tauri monitorar
    setInterval(() => {}, 60000);
    return;
  }

  console.log(`Starting local Next.js frontend on ${targetUrl}...`);
  const frontendDir = path.resolve(__dirname, '../frontend');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: frontendDir,
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000' },
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit(0);
  });
}

main();

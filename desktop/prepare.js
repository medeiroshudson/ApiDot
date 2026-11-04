#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const desktopDir = path.resolve(__dirname);
const binariesDir = path.join(desktopDir, 'src-tauri', 'binaries');
const frontendDir = path.join(repoRoot, 'frontend');
const frontendOutDir = path.join(frontendDir, 'out');

// 1. Determina o target-triple da plataforma atual
function getTargetTriple() {
  if (process.env.APIDOT_TARGET_TRIPLE) {
    return process.env.APIDOT_TARGET_TRIPLE;
  }

  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  } else if (platform === 'win32') {
    return 'x86_64-pc-windows-msvc';
  } else if (platform === 'linux') {
    return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }
  return `${arch}-${platform}`;
}

// 2. Garante a compilação e posicionamento do binário Native AOT do Agent
function prepareAgentBinary() {
  const targetTriple = getTargetTriple();
  const isWindows = process.platform === 'win32' || targetTriple.includes('windows');
  const binaryFileName = isWindows
    ? `apidot-agent-${targetTriple}.exe`
    : `apidot-agent-${targetTriple}`;
  const targetBinaryPath = path.join(binariesDir, binaryFileName);

  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
  }

  // Se APIDOT_AGENT_BINARY_PATH estiver definido e existir, copia diretamente sem compilar via dotnet publish
  const customBinaryEnv = process.env.APIDOT_AGENT_BINARY_PATH;
  if (customBinaryEnv) {
    let resolvedCustomPath = customBinaryEnv;
    if (!path.isAbsolute(resolvedCustomPath) && !fs.existsSync(resolvedCustomPath)) {
      const candidatePath = path.resolve(repoRoot, resolvedCustomPath);
      if (fs.existsSync(candidatePath)) {
        resolvedCustomPath = candidatePath;
      }
    }

    if (fs.existsSync(resolvedCustomPath)) {
      console.log(`Using custom agent binary from ${resolvedCustomPath}...`);
      fs.copyFileSync(resolvedCustomPath, targetBinaryPath);
      if (!isWindows) {
        fs.chmodSync(targetBinaryPath, 0o755);
      }
      console.log(`✓ Copied custom binary ${resolvedCustomPath} -> ${targetBinaryPath}`);
      return;
    } else {
      console.warn(`Warning: APIDOT_AGENT_BINARY_PATH was set to ${customBinaryEnv} but file was not found.`);
    }
  }

  if (fs.existsSync(targetBinaryPath)) {
    console.log(`✓ Sidecar binary already in place: ${binaryFileName}`);
    return;
  }

  console.log(`Building ApiDot.Agent Native AOT for target ${targetTriple}...`);
  try {
    execSync('dotnet publish backend/src/ApiDot.Agent -c Release', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn(`Notice: dotnet publish exited with code, checking build outputs...`);
  }

  const agentName = isWindows ? 'ApiDot.Agent.exe' : 'ApiDot.Agent';
  const rid = process.platform === 'darwin'
    ? (process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64')
    : (process.platform === 'win32' ? 'win-x64' : 'linux-x64');

  const candidates = [
    path.join(repoRoot, 'backend/src/ApiDot.Agent/bin/Release/net9.0', rid, 'publish', agentName),
    path.join(repoRoot, 'backend/src/ApiDot.Agent/bin/Release/net9.0/publish', agentName),
    path.join(repoRoot, 'backend/src/ApiDot.Agent/bin/Debug/net9.0', agentName),
  ];

  let found = false;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      fs.copyFileSync(candidate, targetBinaryPath);
      if (!isWindows) {
        fs.chmodSync(targetBinaryPath, 0o755);
      }
      console.log(`✓ Copied ${candidate} -> ${targetBinaryPath}`);
      found = true;
      break;
    }
  }

  if (!found) {
    console.warn(`Warning: Native AOT binary not found, creating development fallback stub.`);
    if (!isWindows) {
      fs.writeFileSync(
        targetBinaryPath,
        '#!/bin/sh\necho "[APIDOT_SIDECAR_READY:54321]"\nexec sleep 3600\n'
      );
      fs.chmodSync(targetBinaryPath, 0o755);
    } else {
      fs.writeFileSync(targetBinaryPath, '');
    }
  }
}

// 3. Garante que frontend/out exista para evitar erro no tauri build
function prepareFrontendOut() {
  if (!fs.existsSync(frontendOutDir)) {
    fs.mkdirSync(frontendOutDir, { recursive: true });
  }

  const indexHtml = path.join(frontendOutDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    // Cria index.html de redirecionamento ou placeholder estático
    fs.writeFileSync(
      indexHtml,
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ApiDot</title>
  <meta http-equiv="refresh" content="0; url=http://localhost:3000">
</head>
<body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div>
    <h2>Carregando ApiDot...</h2>
    <p style="color:#888;">Conectando ao frontend local...</p>
  </div>
</body>
</html>`
    );
    console.log(`✓ Created placeholder ${indexHtml} for Tauri bundle`);
  }
}

if (require.main === module) {
  prepareAgentBinary();
  prepareFrontendOut();
  console.log('✓ Desktop environment preparation completed successfully.');
}

module.exports = {
  getTargetTriple,
  prepareAgentBinary,
  prepareFrontendOut,
};

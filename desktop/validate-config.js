#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function run() {
  console.log('Validating Tauri v2 desktop scaffolding...');

  const desktopDir = path.resolve(__dirname);
  const srcTauriDir = path.join(desktopDir, 'src-tauri');
  const tauriConfPath = path.join(srcTauriDir, 'tauri.conf.json');
  const capabilityPath = path.join(srcTauriDir, 'capabilities', 'default.json');
  const cargoTomlPath = path.join(srcTauriDir, 'Cargo.toml');
  const buildRsPath = path.join(srcTauriDir, 'build.rs');
  const mainRsPath = path.join(srcTauriDir, 'src', 'main.rs');
  const pkgJsonPath = path.join(desktopDir, 'package.json');
  const rootPkgPath = path.resolve(desktopDir, '..', 'package.json');

  // 1. tauri.conf.json
  assert(fs.existsSync(tauriConfPath), 'tauri.conf.json must exist');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
  assert.strictEqual(tauriConf.$schema, 'https://schema.tauri.app/config/2');
  assert.strictEqual(tauriConf.productName, 'ApiDot');
  assert.strictEqual(tauriConf.version, '0.5.1');
  assert.strictEqual(tauriConf.identifier, 'dev.hmedeiros.apidot');
  assert.strictEqual(tauriConf.build?.devUrl, 'http://localhost:3000');
  assert.strictEqual(tauriConf.build?.frontendDist, '../../frontend/out');
  assert(Array.isArray(tauriConf.app?.windows), 'app.windows must be an array');
  assert.strictEqual(tauriConf.app.windows[0]?.title, 'ApiDot');
  assert.strictEqual(tauriConf.app.windows[0]?.width, 1280);
  assert.strictEqual(tauriConf.app.windows[0]?.height, 800);
  assert.strictEqual(tauriConf.app.windows[0]?.resizable, true);
  assert(tauriConf.app.security?.capabilities?.includes('default'), 'capabilities must include default');
  assert.strictEqual(tauriConf.bundle?.active, true);
  assert.strictEqual(tauriConf.bundle?.targets, 'all');
  assert.strictEqual(tauriConf.bundle?.createUpdaterArtifacts, true, 'bundle.createUpdaterArtifacts must be true');
  assert(tauriConf.bundle?.externalBin?.includes('binaries/apidot-agent'), 'externalBin must include binaries/apidot-agent');
  assert(Array.isArray(tauriConf.plugins?.updater?.endpoints) && tauriConf.plugins.updater.endpoints.length > 0, 'updater endpoints must be configured');
  assert(tauriConf.plugins.updater.endpoints[0].includes('github.com/medeiroshudson/ApiDot/releases'), 'updater endpoint must point to GitHub releases');

  // The updater refuses to start with a placeholder key. Generating the key pair is an
  // operator step; warn during development and fail only where a release is built.
  const updaterPubkey = tauriConf.plugins?.updater?.pubkey;
  const hasRealUpdaterKey =
    typeof updaterPubkey === 'string' &&
    !updaterPubkey.startsWith('REPLACE_WITH') &&
    updaterPubkey.length >= 32;

  if (!hasRealUpdaterKey) {
    const message =
      'plugins.updater.pubkey is not a real public key: generate the key pair with "npx tauri signer generate", commit the public key and keep the private key only in CI secrets.';

    if (process.env.APIDOT_REQUIRE_UPDATER_KEY === 'true') {
      assert(false, message);
    } else {
      console.warn(`WARN: ${message} (set APIDOT_REQUIRE_UPDATER_KEY=true to make this fatal)`);
    }
  }
  console.log('✓ tauri.conf.json verified');

  // 2. capabilities/default.json
  assert(fs.existsSync(capabilityPath), 'capabilities/default.json must exist');
  const capability = JSON.parse(fs.readFileSync(capabilityPath, 'utf-8'));
  assert.strictEqual(capability.identifier, 'default');
  assert(Array.isArray(capability.permissions), 'permissions must be an array');
  assert(capability.permissions.includes('core:default'), 'permissions must include core:default');
  assert(capability.permissions.includes('shell:default'), 'permissions must include shell:default');
  assert(capability.permissions.includes('fs:default'), 'permissions must include fs:default');
  assert(capability.permissions.includes('updater:default'), 'permissions must include updater:default');
  assert(capability.permissions.includes('process:default'), 'permissions must include process:default');
  console.log('✓ capabilities/default.json verified');

  // 3. Cargo.toml
  assert(fs.existsSync(cargoTomlPath), 'Cargo.toml must exist');
  const cargoContent = fs.readFileSync(cargoTomlPath, 'utf-8');
  assert(cargoContent.includes('name = "apidot-desktop"'), 'Cargo.toml name mismatch');
  assert(cargoContent.includes('version = "0.5.1"'), 'Cargo.toml version mismatch');
  assert(cargoContent.includes('edition = "2021"'), 'Cargo.toml edition mismatch');
  assert(cargoContent.includes('tauri-build'), 'Cargo.toml missing tauri-build');
  assert(cargoContent.includes('tauri ='), 'Cargo.toml missing tauri dependency');
  assert(cargoContent.includes('tauri-plugin-shell = "2"'), 'Cargo.toml missing tauri-plugin-shell');
  assert(cargoContent.includes('tauri-plugin-fs = "2"'), 'Cargo.toml missing tauri-plugin-fs');
  assert(cargoContent.includes('tauri-plugin-updater = "2"'), 'Cargo.toml missing tauri-plugin-updater');
  assert(cargoContent.includes('tauri-plugin-process = "2"'), 'Cargo.toml missing tauri-plugin-process');
  assert(cargoContent.includes('serde ='), 'Cargo.toml missing serde');
  assert(cargoContent.includes('serde_json = "1"'), 'Cargo.toml missing serde_json');
  assert(cargoContent.includes('uuid ='), 'Cargo.toml missing uuid');
  assert(cargoContent.includes('tokio ='), 'Cargo.toml missing tokio');
  console.log('✓ Cargo.toml verified');

  // 4. build.rs and main.rs
  assert(fs.existsSync(buildRsPath), 'build.rs must exist');
  const buildRs = fs.readFileSync(buildRsPath, 'utf-8');
  assert(buildRs.includes('tauri_build::build()'), 'build.rs missing tauri_build::build()');
  console.log('✓ build.rs verified');

  assert(fs.existsSync(mainRsPath), 'src/main.rs must exist');
  const mainRs = fs.readFileSync(mainRsPath, 'utf-8');
  assert(mainRs.includes('tauri_plugin_shell::init()'), 'main.rs missing tauri_plugin_shell');
  assert(mainRs.includes('tauri_plugin_fs::init()'), 'main.rs missing tauri_plugin_fs');
  assert(mainRs.includes('tauri_plugin_process::init()'), 'main.rs missing tauri_plugin_process');
  assert(mainRs.includes('tauri_plugin_updater::Builder::new().build()'), 'main.rs missing tauri_plugin_updater');
  assert(mainRs.includes('restart_app_cleanly'), 'main.rs missing restart_app_cleanly');
  assert(mainRs.includes('tauri::generate_context!()'), 'main.rs missing generate_context');
  console.log('✓ src/main.rs verified');

  // 5. desktop/package.json
  assert(fs.existsSync(pkgJsonPath), 'desktop/package.json must exist');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  assert.strictEqual(pkgJson.name, 'apidot-desktop');
  assert.strictEqual(pkgJson.version, '0.5.1');
  assert(pkgJson.scripts?.dev?.includes('tauri dev'), 'scripts.dev must contain tauri dev');
  assert(pkgJson.scripts?.build?.includes('tauri build'), 'scripts.build must contain tauri build');
  assert(pkgJson.dependencies?.['@tauri-apps/api'], 'missing @tauri-apps/api');
  assert(pkgJson.devDependencies?.['@tauri-apps/cli'], 'missing @tauri-apps/cli');
  console.log('✓ desktop/package.json verified');

  // 6. root package.json
  assert(fs.existsSync(rootPkgPath), 'root package.json must exist');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  assert(rootPkg.scripts?.['desktop:dev'], 'missing desktop:dev script');
  assert(rootPkg.scripts?.['desktop:build'], 'missing desktop:build script');
  console.log('✓ root package.json scripts verified');

  // 7. desktop/prepare.js
  const prepareJsPath = path.join(desktopDir, 'prepare.js');
  assert(fs.existsSync(prepareJsPath), 'desktop/prepare.js must exist');
  const prepareJs = fs.readFileSync(prepareJsPath, 'utf-8');
  assert(prepareJs.includes('APIDOT_TARGET_TRIPLE'), 'prepare.js must support APIDOT_TARGET_TRIPLE');
  assert(prepareJs.includes('APIDOT_AGENT_BINARY_PATH'), 'prepare.js must support APIDOT_AGENT_BINARY_PATH');

  // Verify getTargetTriple logic with APIDOT_TARGET_TRIPLE override
  const originalTriple = process.env.APIDOT_TARGET_TRIPLE;
  try {
    process.env.APIDOT_TARGET_TRIPLE = 'x86_64-test-target';
    const { getTargetTriple } = require(prepareJsPath);
    assert.strictEqual(getTargetTriple(), 'x86_64-test-target', 'getTargetTriple must return APIDOT_TARGET_TRIPLE when set');
  } finally {
    if (originalTriple !== undefined) {
      process.env.APIDOT_TARGET_TRIPLE = originalTriple;
    } else {
      delete process.env.APIDOT_TARGET_TRIPLE;
    }
  }

  // Verify prepareAgentBinary copies custom binary when APIDOT_AGENT_BINARY_PATH is set
  const originalBinaryPath = process.env.APIDOT_AGENT_BINARY_PATH;
  const originalTripleForBinary = process.env.APIDOT_TARGET_TRIPLE;
  const mockTempBinary = path.join(desktopDir, '.tmp-mock-agent-binary');
  const mockTargetTriple = 'mock-unit-test-triple';
  const mockTargetBinary = path.join(srcTauriDir, 'binaries', `apidot-agent-${mockTargetTriple}`);

  try {
    fs.writeFileSync(mockTempBinary, 'MOCK_AGENT_BINARY_CONTENT');
    process.env.APIDOT_AGENT_BINARY_PATH = mockTempBinary;
    process.env.APIDOT_TARGET_TRIPLE = mockTargetTriple;

    const { prepareAgentBinary } = require(prepareJsPath);
    prepareAgentBinary();

    assert(fs.existsSync(mockTargetBinary), 'mock binary must be copied to target destination');
    const copiedContent = fs.readFileSync(mockTargetBinary, 'utf-8');
    assert.strictEqual(copiedContent, 'MOCK_AGENT_BINARY_CONTENT', 'copied binary content must match source');
  } finally {
    if (fs.existsSync(mockTempBinary)) {
      fs.unlinkSync(mockTempBinary);
    }
    if (fs.existsSync(mockTargetBinary)) {
      fs.unlinkSync(mockTargetBinary);
    }
    if (originalBinaryPath !== undefined) {
      process.env.APIDOT_AGENT_BINARY_PATH = originalBinaryPath;
    } else {
      delete process.env.APIDOT_AGENT_BINARY_PATH;
    }
    if (originalTripleForBinary !== undefined) {
      process.env.APIDOT_TARGET_TRIPLE = originalTripleForBinary;
    } else {
      delete process.env.APIDOT_TARGET_TRIPLE;
    }
  }
  console.log('✓ desktop/prepare.js verified');

  // 8. .github/workflows/desktop-release.yml
  const desktopWorkflowPath = path.resolve(desktopDir, '..', '.github', 'workflows', 'desktop-release.yml');
  assert(fs.existsSync(desktopWorkflowPath), '.github/workflows/desktop-release.yml must exist');
  const workflowContent = fs.readFileSync(desktopWorkflowPath, 'utf-8');

  // Triggers & permissions
  assert(/tags:\s*\n\s+- ['"]v\*['"]/.test(workflowContent), 'desktop-release.yml must trigger on tags v*');
  assert(workflowContent.includes('workflow_dispatch:'), 'desktop-release.yml must support workflow_dispatch');
  assert(workflowContent.includes('contents: write'), 'desktop-release.yml must require contents: write permission');

  // Matrix runners & targets
  assert(workflowContent.includes('macos-latest'), 'desktop-release.yml matrix missing macos-latest');
  assert(workflowContent.includes('macos-13'), 'desktop-release.yml matrix missing macos-13');
  assert(workflowContent.includes('ubuntu-latest'), 'desktop-release.yml matrix missing ubuntu-latest');
  assert(workflowContent.includes('windows-latest'), 'desktop-release.yml matrix missing windows-latest');
  assert(workflowContent.includes('aarch64-apple-darwin'), 'desktop-release.yml matrix missing aarch64-apple-darwin');
  assert(workflowContent.includes('x86_64-apple-darwin'), 'desktop-release.yml matrix missing x86_64-apple-darwin');
  assert(workflowContent.includes('x86_64-unknown-linux-gnu'), 'desktop-release.yml matrix missing x86_64-unknown-linux-gnu');
  assert(workflowContent.includes('x86_64-pc-windows-msvc'), 'desktop-release.yml matrix missing x86_64-pc-windows-msvc');

  // Steps & actions
  assert(workflowContent.includes('actions/setup-dotnet'), 'desktop-release.yml missing actions/setup-dotnet');
  assert(workflowContent.includes("dotnet-version: '9.0.x'"), 'desktop-release.yml must use .NET 9.0.x');
  assert(workflowContent.includes('actions/setup-node'), 'desktop-release.yml missing actions/setup-node');
  assert(workflowContent.includes('node-version: 20'), 'desktop-release.yml must use Node 20');
  assert(workflowContent.includes('rustup target add'), 'desktop-release.yml must configure rustup target');
  assert(workflowContent.includes('libwebkit2gtk-4.1-dev'), 'desktop-release.yml must install Linux webkit prerequisites');
  assert(workflowContent.includes('dotnet publish'), 'desktop-release.yml must compile Agent Native AOT');
  assert(workflowContent.includes('APIDOT_TARGET_TRIPLE'), 'desktop-release.yml must pass APIDOT_TARGET_TRIPLE to prepare.js');
  assert(workflowContent.includes('APIDOT_AGENT_BINARY_PATH'), 'desktop-release.yml must pass APIDOT_AGENT_BINARY_PATH to prepare.js');
  assert(workflowContent.includes('npm --prefix desktop install'), 'desktop-release.yml must install desktop dependencies');
  assert(workflowContent.includes('tauri-apps/tauri-action@'), 'desktop-release.yml must use tauri-apps/tauri-action');
  assert(
    /tauri-apps\/tauri-action@(v0|[0-9a-f]{40})/.test(workflowContent),
    'tauri-apps/tauri-action must be pinned to v0 or a full commit SHA'
  );
  assert(workflowContent.includes('projectPath: desktop'), 'tauri-action must use projectPath: desktop');
  assert(workflowContent.includes('includeUpdaterJson: true'), 'tauri-action must set includeUpdaterJson: true');
  assert(workflowContent.includes('updaterJsonKeepUniversal: true'), 'tauri-action must set updaterJsonKeepUniversal: true');
  assert(workflowContent.includes('TAURI_SIGNING_PRIVATE_KEY'), 'tauri-action must use TAURI_SIGNING_PRIVATE_KEY');
  assert(workflowContent.includes('TAURI_SIGNING_PRIVATE_KEY_PASSWORD'), 'tauri-action must use TAURI_SIGNING_PRIVATE_KEY_PASSWORD');
  console.log('✓ .github/workflows/desktop-release.yml verified');

  console.log('\nAll 8 verification checks passed successfully!');
}

run();

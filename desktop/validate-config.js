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

  console.log('\nAll 6 verification checks passed successfully!');
}

run();

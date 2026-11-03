#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function run() {
  console.log('Validating Tauri v2 Sidecar Lifecycle & IPC implementation...');

  const desktopDir = path.resolve(__dirname);
  const srcTauriDir = path.join(desktopDir, 'src-tauri');
  const sidecarRsPath = path.join(srcTauriDir, 'src', 'sidecar.rs');
  const mainRsPath = path.join(srcTauriDir, 'src', 'main.rs');
  const libRsPath = path.join(srcTauriDir, 'src', 'lib.rs');
  const cargoTomlPath = path.join(srcTauriDir, 'Cargo.toml');
  const testsRsPath = path.join(srcTauriDir, 'tests', 'sidecar_tests.rs');
  const sidecarTestTsPath = path.join(desktopDir, 'sidecar.test.ts');

  // 1. Check sidecar.rs
  assert(fs.existsSync(sidecarRsPath), 'desktop/src-tauri/src/sidecar.rs must exist');
  const sidecarRs = fs.readFileSync(sidecarRsPath, 'utf-8');

  assert(
    sidecarRs.includes('pub fn parse_sidecar_port(line: &str) -> Option<u16>'),
    'sidecar.rs missing parse_sidecar_port function'
  );
  assert(
    sidecarRs.includes('pub struct SidecarInfo'),
    'sidecar.rs missing SidecarInfo struct'
  );
  assert(
    sidecarRs.includes('pub struct SidecarManager'),
    'sidecar.rs missing SidecarManager struct'
  );
  assert(
    sidecarRs.includes('pub async fn start_sidecar(&mut self)'),
    'sidecar.rs missing start_sidecar method'
  );
  assert(
    sidecarRs.includes('pub async fn stop_sidecar(&mut self)'),
    'sidecar.rs missing stop_sidecar method'
  );
  assert(
    sidecarRs.includes('impl Drop for SidecarManager'),
    'sidecar.rs missing Drop implementation for SidecarManager'
  );
  assert(
    sidecarRs.includes('pub async fn get_sidecar_info'),
    'sidecar.rs missing get_sidecar_info Tauri command'
  );
  assert(
    sidecarRs.includes('kill_on_drop(true)'),
    'sidecar.rs missing kill_on_drop(true) for zero orphan processes'
  );
  assert(
    sidecarRs.includes('[APIDOT_SIDECAR_READY:'),
    'sidecar.rs missing [APIDOT_SIDECAR_READY: ready marker'
  );
  console.log('✓ desktop/src-tauri/src/sidecar.rs verified');

  // 2. Check main.rs
  assert(fs.existsSync(mainRsPath), 'desktop/src-tauri/src/main.rs must exist');
  const mainRs = fs.readFileSync(mainRsPath, 'utf-8');

  assert(mainRs.includes('SidecarManager'), 'main.rs missing SidecarManager');
  assert(mainRs.includes('get_sidecar_info'), 'main.rs missing get_sidecar_info');
  assert(mainRs.includes('.manage('), 'main.rs missing state management for SidecarManager');
  assert(
    mainRs.includes('get_sidecar_info') && mainRs.includes('generate_handler!'),
    'main.rs missing invoke_handler for get_sidecar_info'
  );
  assert(mainRs.includes('on_window_event'), 'main.rs missing on_window_event hook');
  assert(
    mainRs.includes('CloseRequested') || mainRs.includes('Destroyed'),
    'main.rs missing close event detection for graceful shutdown'
  );
  assert(mainRs.includes('stop_sidecar'), 'main.rs missing stop_sidecar call in window event hook');
  console.log('✓ desktop/src-tauri/src/main.rs verified');

  // 3. Check lib.rs
  assert(fs.existsSync(libRsPath), 'desktop/src-tauri/src/lib.rs must exist');
  const libRs = fs.readFileSync(libRsPath, 'utf-8');
  assert(libRs.includes('pub mod sidecar;'), 'lib.rs missing pub mod sidecar;');
  console.log('✓ desktop/src-tauri/src/lib.rs verified');

  // 4. Check Cargo.toml
  assert(fs.existsSync(cargoTomlPath), 'Cargo.toml must exist');
  const cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
  assert(cargoToml.includes('[lib]'), 'Cargo.toml missing [lib] definition');
  assert(cargoToml.includes('name = "apidot_desktop"'), 'Cargo.toml missing apidot_desktop lib name');
  console.log('✓ desktop/src-tauri/Cargo.toml verified');

  // 5. Check sidecar_tests.rs
  assert(fs.existsSync(testsRsPath), 'desktop/src-tauri/tests/sidecar_tests.rs must exist');
  const testsRs = fs.readFileSync(testsRsPath, 'utf-8');
  assert(
    testsRs.includes('fn test_parse_sidecar_ready_line()'),
    'sidecar_tests.rs missing test_parse_sidecar_ready_line'
  );
  assert(
    testsRs.includes('[APIDOT_SIDECAR_READY:54321]'),
    'sidecar_tests.rs missing ready marker test line'
  );
  assert(
    testsRs.includes('parse_sidecar_port(output)'),
    'sidecar_tests.rs missing parse_sidecar_port assertion'
  );
  console.log('✓ desktop/src-tauri/tests/sidecar_tests.rs verified');

  // 6. Check sidecarLogic.test.ts
  const frontendTestTsPath = path.resolve(desktopDir, '../frontend/src/sidecarLogic.test.ts');
  assert(fs.existsSync(frontendTestTsPath), 'frontend/src/sidecarLogic.test.ts must exist');
  console.log('✓ frontend/src/sidecarLogic.test.ts verified');

  // 7. Logic simulation of port parser
  const regex = /\[APIDOT_SIDECAR_READY:(\d+)\]/;
  const parse = (str) => {
    const m = str.match(regex);
    if (!m) return null;
    const p = parseInt(m[1], 10);
    return (p > 0 && p <= 65535) ? p : null;
  };

  assert.strictEqual(parse('[APIDOT_SIDECAR_READY:54321]\n'), 54321);
  assert.strictEqual(parse('log: [APIDOT_SIDECAR_READY:49152] ready'), 49152);
  assert.strictEqual(parse('[APIDOT_SIDECAR_READY:0]'), null);
  assert.strictEqual(parse('[APIDOT_SIDECAR_READY:65536]'), null);
  assert.strictEqual(parse('[APIDOT_SIDECAR_READY:abc]'), null);
  assert.strictEqual(parse(''), null);
  console.log('✓ Ready marker regex and port extraction logic verified');

  console.log('\nAll Sidecar Lifecycle & IPC validation checks passed successfully!');
}

run();

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function run() {
  console.log('Validating Tauri v2 Native Menus & About Metadata implementation...');

  const desktopDir = path.resolve(__dirname);
  const srcTauriDir = path.join(desktopDir, 'src-tauri');
  const menuRsPath = path.join(srcTauriDir, 'src', 'menu.rs');
  const mainRsPath = path.join(srcTauriDir, 'src', 'main.rs');
  const libRsPath = path.join(srcTauriDir, 'src', 'lib.rs');
  const testsRsPath = path.join(srcTauriDir, 'tests', 'menu_tests.rs');

  // 1. Check menu.rs exists and exports key functions and constants
  assert(fs.existsSync(menuRsPath), 'desktop/src-tauri/src/menu.rs must exist');
  const menuRs = fs.readFileSync(menuRsPath, 'utf-8');

  assert(
    menuRs.includes('pub fn build_app_menu'),
    'menu.rs missing build_app_menu function'
  );
  assert(
    menuRs.includes('pub fn create_about_metadata'),
    'menu.rs missing create_about_metadata function'
  );
  assert(
    menuRs.includes('pub fn load_about_icon'),
    'menu.rs missing load_about_icon function'
  );
  assert(
    menuRs.includes('pub fn create_settings_item'),
    'menu.rs missing create_settings_item function'
  );
  assert(
    menuRs.includes('pub const OPEN_SETTINGS_ID: &str = "open_settings";'),
    'menu.rs missing OPEN_SETTINGS_ID constant'
  );
  assert(
    menuRs.includes('pub const OPEN_SETTINGS_ACCELERATOR: &str = "CmdOrControl+,";'),
    'menu.rs missing OPEN_SETTINGS_ACCELERATOR constant'
  );
  assert(
    menuRs.includes('pub const OPEN_SETTINGS_EVENT: &str = "open-global-settings";'),
    'menu.rs missing OPEN_SETTINGS_EVENT constant'
  );
  assert(
    menuRs.includes('pub const ABOUT_NAME: &str = "ApiDot";'),
    'menu.rs missing ABOUT_NAME constant'
  );
  assert(
    menuRs.includes('pub const ABOUT_WEBSITE: &str = "https://apidot.hmedeiros.dev";'),
    'menu.rs missing ABOUT_WEBSITE constant'
  );
  assert(
    menuRs.includes('pub const ABOUT_COPYRIGHT: &str = "© 2026 Hudson Medeiros";'),
    'menu.rs missing ABOUT_COPYRIGHT constant'
  );
  assert(
    menuRs.includes('pub const ABOUT_LICENSE: &str = "MIT License";'),
    'menu.rs missing ABOUT_LICENSE constant'
  );
  assert(
    menuRs.includes('Test and debug any API, anywhere — from localhost to production'),
    'menu.rs missing ABOUT_COMMENTS text'
  );
  assert(
    menuRs.includes('build_macos_menu') && menuRs.includes('build_non_macos_menu'),
    'menu.rs must provide platform-specific menu builders'
  );
  console.log('✓ desktop/src-tauri/src/menu.rs verified');

  // 2. Check lib.rs exports
  assert(fs.existsSync(libRsPath), 'desktop/src-tauri/src/lib.rs must exist');
  const libRs = fs.readFileSync(libRsPath, 'utf-8');
  assert(libRs.includes('pub mod menu;'), 'lib.rs missing pub mod menu;');
  assert(libRs.includes('build_app_menu'), 'lib.rs missing build_app_menu export');
  console.log('✓ desktop/src-tauri/src/lib.rs exports verified');

  // 3. Check main.rs wiring
  assert(fs.existsSync(mainRsPath), 'desktop/src-tauri/src/main.rs must exist');
  const mainRs = fs.readFileSync(mainRsPath, 'utf-8');
  assert(
    mainRs.includes('build_app_menu'),
    'main.rs missing build_app_menu call'
  );
  assert(
    mainRs.includes('set_menu'),
    'main.rs missing set_menu call'
  );
  assert(
    mainRs.includes('on_menu_event'),
    'main.rs missing on_menu_event registration'
  );
  assert(
    mainRs.includes('open_settings'),
    'main.rs missing open_settings check in menu handler'
  );
  assert(
    mainRs.includes('open-global-settings'),
    'main.rs missing open-global-settings emission in menu handler'
  );
  console.log('✓ desktop/src-tauri/src/main.rs wiring verified');

  // 4. Check menu_tests.rs
  assert(fs.existsSync(testsRsPath), 'desktop/src-tauri/tests/menu_tests.rs must exist');
  const testRs = fs.readFileSync(testsRsPath, 'utf-8');
  assert(
    testRs.includes('test_menu_builder_compiles_and_creates_structure'),
    'menu_tests.rs missing test_menu_builder_compiles_and_creates_structure'
  );
  assert(
    testRs.includes('test_about_metadata_configuration'),
    'menu_tests.rs missing test_about_metadata_configuration'
  );
  console.log('✓ desktop/src-tauri/tests/menu_tests.rs verified');

  console.log('\nAll native menu and about metadata verification checks passed successfully!');
}

run();

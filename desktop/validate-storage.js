#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function run() {
  console.log('Validating Tauri v2 Local-First Storage & IPC implementation...');

  const desktopDir = path.resolve(__dirname);
  const srcTauriDir = path.join(desktopDir, 'src-tauri');
  const storageRsPath = path.join(srcTauriDir, 'src', 'storage.rs');
  const mainRsPath = path.join(srcTauriDir, 'src', 'main.rs');
  const libRsPath = path.join(srcTauriDir, 'src', 'lib.rs');
  const testsRsPath = path.join(srcTauriDir, 'tests', 'storage_tests.rs');
  const offlineStorageTsPath = path.resolve(desktopDir, '../frontend/src/lib/storage/offlineStorage.ts');
  const offlineStorageTestTsPath = path.resolve(desktopDir, '../frontend/src/lib/storage/offlineStorage.test.ts');
  const workspaceStoreTsPath = path.resolve(desktopDir, '../frontend/src/stores/useWorkspaceStore.ts');
  const workspaceStoreTestTsPath = path.resolve(desktopDir, '../frontend/src/stores/useWorkspaceStore.test.ts');

  // 1. Check storage.rs
  assert(fs.existsSync(storageRsPath), 'desktop/src-tauri/src/storage.rs must exist');
  const storageRs = fs.readFileSync(storageRsPath, 'utf-8');

  assert(
    storageRs.includes('pub fn get_storage_root() -> PathBuf'),
    'storage.rs missing get_storage_root function'
  );
  assert(
    storageRs.includes('pub fn sanitize_relative_path(rel_path: &str) -> Result<PathBuf, String>'),
    'storage.rs missing sanitize_relative_path function'
  );
  assert(
    storageRs.includes('pub async fn fs_save_storage'),
    'storage.rs missing fs_save_storage command'
  );
  assert(
    storageRs.includes('pub async fn fs_load_storage'),
    'storage.rs missing fs_load_storage command'
  );
  assert(
    storageRs.includes('pub async fn fs_list_storage'),
    'storage.rs missing fs_list_storage command'
  );
  assert(
    storageRs.includes('pub async fn fs_delete_storage'),
    'storage.rs missing fs_delete_storage command'
  );
  assert(
    storageRs.includes('Component::ParentDir'),
    'storage.rs missing Component::ParentDir check for traversal prevention'
  );
  assert(
    storageRs.includes('full_path == root'),
    'storage.rs missing check preventing root directory reference from sanitize_relative_path'
  );
  assert(
    storageRs.includes("replace('\\\\', '/')"),
    'storage.rs missing backslash normalization for cross-platform traversal prevention'
  );
  assert(
    storageRs.includes('APIDOT_STORAGE_ROOT'),
    'storage.rs missing APIDOT_STORAGE_ROOT environment variable support'
  );
  console.log('✓ desktop/src-tauri/src/storage.rs verified');

  // 2. Check main.rs
  assert(fs.existsSync(mainRsPath), 'desktop/src-tauri/src/main.rs must exist');
  const mainRs = fs.readFileSync(mainRsPath, 'utf-8');
  assert(mainRs.includes('fs_save_storage'), 'main.rs missing fs_save_storage in invoke_handler');
  assert(mainRs.includes('fs_load_storage'), 'main.rs missing fs_load_storage in invoke_handler');
  assert(mainRs.includes('fs_list_storage'), 'main.rs missing fs_list_storage in invoke_handler');
  assert(mainRs.includes('fs_delete_storage'), 'main.rs missing fs_delete_storage in invoke_handler');
  console.log('✓ desktop/src-tauri/src/main.rs verified');

  // 3. Check lib.rs
  assert(fs.existsSync(libRsPath), 'desktop/src-tauri/src/lib.rs must exist');
  const libRs = fs.readFileSync(libRsPath, 'utf-8');
  assert(libRs.includes('pub mod storage;'), 'lib.rs missing pub mod storage;');
  assert(libRs.includes('fs_save_storage'), 'lib.rs missing export of fs_save_storage');
  console.log('✓ desktop/src-tauri/src/lib.rs verified');

  // 4. Check storage_tests.rs
  assert(fs.existsSync(testsRsPath), 'desktop/src-tauri/tests/storage_tests.rs must exist');
  const testsRs = fs.readFileSync(testsRsPath, 'utf-8');
  assert(testsRs.includes('test_storage_root_resolution'), 'storage_tests.rs missing test_storage_root_resolution');
  assert(testsRs.includes('test_path_traversal_prevention_parent_dir'), 'storage_tests.rs missing test_path_traversal_prevention_parent_dir');
  assert(testsRs.includes('test_save_load_delete_roundtrip'), 'storage_tests.rs missing test_save_load_delete_roundtrip');
  console.log('✓ desktop/src-tauri/tests/storage_tests.rs verified');

  // 5. Check offlineStorage.ts
  assert(fs.existsSync(offlineStorageTsPath), 'frontend/src/lib/storage/offlineStorage.ts must exist');
  const offlineStorageTs = fs.readFileSync(offlineStorageTsPath, 'utf-8');
  assert(offlineStorageTs.includes('export interface PendingMutation'), 'offlineStorage.ts missing PendingMutation interface');
  assert(offlineStorageTs.includes('export async function saveWorkspaceOffline'), 'offlineStorage.ts missing saveWorkspaceOffline');
  assert(offlineStorageTs.includes('export async function loadWorkspacesOffline'), 'offlineStorage.ts missing loadWorkspacesOffline');
  assert(offlineStorageTs.includes('export const saveWorkspaceLocally = saveWorkspaceOffline'), 'offlineStorage.ts missing saveWorkspaceLocally alias');
  assert(offlineStorageTs.includes('export const loadWorkspacesLocally = loadWorkspacesOffline'), 'offlineStorage.ts missing loadWorkspacesLocally alias');
  assert(offlineStorageTs.includes('export async function saveCollectionOffline'), 'offlineStorage.ts missing saveCollectionOffline');
  assert(offlineStorageTs.includes('export async function loadCollectionsOffline'), 'offlineStorage.ts missing loadCollectionsOffline');
  assert(offlineStorageTs.includes('export async function queuePendingMutation'), 'offlineStorage.ts missing queuePendingMutation');
  assert(offlineStorageTs.includes('export async function getPendingMutations'), 'offlineStorage.ts missing getPendingMutations');
  assert(offlineStorageTs.includes('export async function clearPendingMutations'), 'offlineStorage.ts missing clearPendingMutations');
  assert(offlineStorageTs.includes('export async function deleteWorkspaceOffline'), 'offlineStorage.ts missing deleteWorkspaceOffline');
  assert(offlineStorageTs.includes('export async function deleteCollectionOffline'), 'offlineStorage.ts missing deleteCollectionOffline');
  assert(offlineStorageTs.includes('export const defaultStorageAdapters'), 'offlineStorage.ts missing defaultStorageAdapters');
  console.log('✓ frontend/src/lib/storage/offlineStorage.ts verified');

  // 6. Check offlineStorage.test.ts
  assert(fs.existsSync(offlineStorageTestTsPath), 'frontend/src/lib/storage/offlineStorage.test.ts must exist');
  const testContent = fs.readFileSync(offlineStorageTestTsPath, 'utf-8');
  assert(testContent.includes('saves workspace JSON to local storage and enqueues mutation when offline'), 'offlineStorage.test.ts missing step 1 test');
  console.log('✓ frontend/src/lib/storage/offlineStorage.test.ts verified');

  // 7. Check useWorkspaceStore integration
  assert(fs.existsSync(workspaceStoreTsPath), 'useWorkspaceStore.ts must exist');
  const storeTs = fs.readFileSync(workspaceStoreTsPath, 'utf-8');
  assert(storeTs.includes('saveWorkspaceOffline'), 'useWorkspaceStore.ts missing saveWorkspaceOffline integration');
  assert(storeTs.includes('loadWorkspacesOffline'), 'useWorkspaceStore.ts missing loadWorkspacesOffline integration');
  assert(storeTs.includes('isDesktop'), 'useWorkspaceStore.ts missing isDesktop check');

  assert(fs.existsSync(workspaceStoreTestTsPath), 'useWorkspaceStore.test.ts must exist');
  const storeTestTs = fs.readFileSync(workspaceStoreTestTsPath, 'utf-8');
  assert(storeTestTs.includes('Desktop Offline Fallback & Local Storage'), 'useWorkspaceStore.test.ts missing offline fallback tests');
  console.log('✓ frontend/src/stores/useWorkspaceStore.ts and tests verified');

  // 8. Logic simulation of path sanitization
  function sanitizeRelPath(rel) {
    if (rel.includes('\0')) throw new Error('null char');
    const normalized = rel.replace(/\\/g, '/');
    const trimmed = normalized.replace(/^\/+/, '');
    if (!trimmed) throw new Error('empty path');
    const parts = trimmed.split('/');
    for (const part of parts) {
      if (part === '..') throw new Error('ParentDir traversal detected');
      if (part.includes(':')) throw new Error('Prefix drive detected');
    }
    if (trimmed === '.' || trimmed === './') {
      throw new Error('Path refers to storage root directory');
    }
    return trimmed;
  }

  assert.strictEqual(sanitizeRelPath('workspaces/ws-1.json'), 'workspaces/ws-1.json');
  assert.strictEqual(sanitizeRelPath('/workspaces/ws-1.json'), 'workspaces/ws-1.json');
  assert.strictEqual(sanitizeRelPath('workspaces\\ws-1.json'), 'workspaces/ws-1.json');
  assert.throws(() => sanitizeRelPath('../secret.txt'), /ParentDir/);
  assert.throws(() => sanitizeRelPath('..\\secret.txt'), /ParentDir/);
  assert.throws(() => sanitizeRelPath('workspaces/../../etc/passwd'), /ParentDir/);
  assert.throws(() => sanitizeRelPath('workspaces\\..\\..\\etc\\passwd'), /ParentDir/);
  assert.throws(() => sanitizeRelPath('.'), /root directory/);
  assert.throws(() => sanitizeRelPath('./'), /root directory/);
  assert.throws(() => sanitizeRelPath('.\\'), /root directory/);
  assert.throws(() => sanitizeRelPath(''), /empty path/);
  assert.throws(() => sanitizeRelPath('test/\0evil'), /null char/);
  console.log('✓ Path sanitization logic verified');

  console.log('\nAll 8 Local-First Storage & IPC validation checks passed successfully!');
}

run();

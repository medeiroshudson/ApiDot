import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Tauri v2 Desktop Configuration', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const desktopRoot = path.join(repoRoot, 'desktop');
  const srcTauriDir = path.join(desktopRoot, 'src-tauri');
  const tauriConfPath = path.join(srcTauriDir, 'tauri.conf.json');
  const capabilityPath = path.join(srcTauriDir, 'capabilities', 'default.json');
  const cargoTomlPath = path.join(srcTauriDir, 'Cargo.toml');
  const packageJsonPath = path.join(desktopRoot, 'package.json');
  const rootPackageJsonPath = path.join(repoRoot, 'package.json');

  it('validates tauri.conf.json structure and required properties', () => {
    expect(fs.existsSync(tauriConfPath)).toBe(true);

    const content = fs.readFileSync(tauriConfPath, 'utf-8');
    const config = JSON.parse(content);

    expect(config.$schema).toBe('https://schema.tauri.app/config/2');
    expect(config.productName).toBe('ApiDot');
    expect(config.version).toBe('0.5.1');
    expect(config.identifier).toBe('dev.hmedeiros.apidot');

    expect(config.build).toBeDefined();
    expect(config.build.devUrl).toBe('http://localhost:3000');
    expect(config.build.frontendDist).toBe('../../frontend/out');

    expect(config.app).toBeDefined();
    expect(config.app.windows).toBeInstanceOf(Array);
    expect(config.app.windows.length).toBeGreaterThan(0);
    expect(config.app.windows[0].title).toBe('ApiDot');
    expect(config.app.windows[0].label).toBe('main');
    expect(config.app.windows[0].width).toBe(1280);
    expect(config.app.windows[0].height).toBe(800);
    expect(config.app.windows[0].resizable).toBe(true);

    expect(config.app.security).toBeDefined();
    expect(config.app.security.capabilities).toContain('default');

    expect(config.bundle).toBeDefined();
    expect(config.bundle.active).toBe(true);
    expect(config.bundle.externalBin).toContain('binaries/apidot-agent');
  });

  it('validates default capability permissions for core, shell, and fs', () => {
    expect(fs.existsSync(capabilityPath)).toBe(true);

    const content = fs.readFileSync(capabilityPath, 'utf-8');
    const capability = JSON.parse(content);

    expect(capability.identifier).toBe('default');
    expect(capability.windows).toContain('main');
    expect(capability.permissions).toContain('core:default');
    expect(capability.permissions).toContain('shell:default');
    expect(capability.permissions).toContain('fs:default');
  });

  it('validates Cargo.toml dependencies and metadata for Tauri v2', () => {
    expect(fs.existsSync(cargoTomlPath)).toBe(true);

    const content = fs.readFileSync(cargoTomlPath, 'utf-8');
    expect(content).toContain('name = "apidot-desktop"');
    expect(content).toContain('version = "0.5.1"');
    expect(content).toContain('tauri-build = { version = "2"');
    expect(content).toContain('tauri = { version = "2"');
    expect(content).toContain('tauri-plugin-shell = "2"');
    expect(content).toContain('tauri-plugin-fs = "2"');
    expect(content).toContain('tokio = { version = "1"');
    expect(content).toContain('uuid = { version = "1"');
  });

  it('validates desktop package.json scripts and dependencies', () => {
    expect(fs.existsSync(packageJsonPath)).toBe(true);

    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    expect(pkg.name).toBe('apidot-desktop');
    expect(pkg.version).toBe('0.5.1');
    expect(pkg.scripts?.dev).toContain('tauri dev');
    expect(pkg.scripts?.build).toContain('tauri build');
    expect(pkg.dependencies?.['@tauri-apps/api']).toBeDefined();
    expect(pkg.devDependencies?.['@tauri-apps/cli']).toBeDefined();
  });

  it('validates the root development interface', () => {
    expect(fs.existsSync(rootPackageJsonPath)).toBe(true);

    const content = fs.readFileSync(rootPackageJsonPath, 'utf-8');
    const rootPkg = JSON.parse(content);

    for (const script of ['dev', 'dev:local', 'dev:desktop', 'build', 'build:desktop', 'test', 'check']) {
      expect(rootPkg.scripts?.[script]).toBeDefined();
    }
  });
});

import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';

function loadRootDotEnv() {
  try {
    let currentDir = process.cwd();
    for (let i = 0; i < 3; i++) {
      const candidate = path.resolve(currentDir, '.env');
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            let value = trimmed.slice(idx + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  } catch {
    // Ignore defensive fallback
  }
}

loadRootDotEnv();

// The desktop bundle ships the Next app as static files (no Node server).
// Set NEXT_DESKTOP_EXPORT=1 to emit a trimmed static export; the default
// remains the standalone server build used by Docker and local development.
const isDesktopExport = process.env.NEXT_DESKTOP_EXPORT === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isDesktopExport ? 'export' : 'standalone',
  ...(isDesktopExport ? { images: { unoptimized: true } } : {}),
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname, '..'),
    rules: {
      '*.svg': {
        loaders: [path.resolve(__dirname, 'loaders/svg-react-loader.cjs')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      use: [path.resolve(__dirname, 'loaders/svg-react-loader.cjs')],
    });
    return config;
  },
  async rewrites() {
    // Static export has no server to apply rewrites; the desktop shell talks to
    // the agent over its own transport instead of /api proxies.
    if (isDesktopExport) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/api/:path*`,
      },
      {
        source: '/signin-oidc',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/signin-oidc`,
      },
      {
        source: '/install.sh',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/install.sh`,
      },
      {
        source: '/install.ps1',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/install.ps1`,
      },
    ];
  },
};

export default nextConfig;

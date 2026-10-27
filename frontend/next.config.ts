import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/api/:path*`,
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

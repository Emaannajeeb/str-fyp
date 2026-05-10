import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  /** Fixes tracing root when a parent directory has another lockfile (see Next.js workspace warning). */
  outputFileTracingRoot: path.join(__dirname),

  /** Heavy SDKs that ship browser/React-adjacent code; bundling them breaks server RSC/hybrid imports (e.g. createContext). */
  serverExternalPackages: ['@streamflow/stream', '@streamflow/common'],
  
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  images: {
    domains: [],
    // Add image domains as needed
    // domains: ['example.com'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;


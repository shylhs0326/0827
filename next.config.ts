import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: '25mb' } },
};

export default nextConfig;

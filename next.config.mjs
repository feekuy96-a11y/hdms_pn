/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  turbopack: {
    root: process.cwd(),
  },
  trailingSlash: true,
  basePath: process.env.BASE_PATH || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || '',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;

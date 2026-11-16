/** @type {import('next').NextConfig} */
const nextConfig = {
  // Development only: detect effects/listeners that are not cleaned up without
  // changing the production static export's runtime behavior.
  reactStrictMode: process.env.NODE_ENV !== "production",
  output: process.env.NEXT_OUTPUT === 'export' ? 'export' : process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  turbopack: {
    root: process.cwd(),
  },
  trailingSlash: true,
  basePath: process.env.BASE_PATH || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || '',
  },
  images: {
    unoptimized: process.env.NEXT_OUTPUT === "export",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;

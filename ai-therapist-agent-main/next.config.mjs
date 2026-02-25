/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  // moved out of `experimental` (Next.js 14 requirement)
  skipMiddlewareUrlNormalize: true,

  experimental: {
    missingSuspenseWithCSRBailout: false,
  },

  reactStrictMode: false,

  images: {
    unoptimized: true,
  },

  pageExtensions: ["tsx", "ts", "jsx", "js"].filter(
    (ext) => !ext.includes("spec")
  ),

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      sharp$: false,
      canvas$: false,
    };
    return config;
  },

  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
};

export default nextConfig;

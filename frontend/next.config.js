/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Ensure static exports work properly
  trailingSlash: true,
  // Image optimization
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

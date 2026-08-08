/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Security: don't leak the framework version in response headers
  poweredByHeader: false,

  images: {
    // Add remote image hosts here as they're needed (e.g. Supabase storage)
    remotePatterns: [],
  },
};

module.exports = nextConfig;

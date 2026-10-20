/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Security: don't leak the framework version in response headers
  poweredByHeader: false,

  // Next 16 blocks dev-only resources (HMR, client chunks) for any host but
  // localhost, so on 127.0.0.1 the page never hydrated and the login form
  // fell back to a plain GET submit — password in the URL, never sent to
  // Supabase (2026-10-20). Browser automation can only reach 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],

  images: {
    // Add remote image hosts here as they're needed (e.g. Supabase storage)
    remotePatterns: [],
  },
};

module.exports = nextConfig;

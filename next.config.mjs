const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@geiger/ui"],
  // All Geiger suite apps are served on one origin under different base paths.
  // Same origin => shared @supabase/ssr localStorage session across the suite.
  basePath: isProd ? "/comms" : "",
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/comms" : "",
  },
};

export default nextConfig;

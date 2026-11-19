import type { NextConfig } from "next";

// cacheComponents/partialPrefetching are intentionally off: this is an
// internal back-office where almost every page reads live data per request.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

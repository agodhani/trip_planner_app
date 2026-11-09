import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server only trusts `localhost` by default; a page opened at
  // 127.0.0.1 never hydrates (forms submit, nothing interactive works).
  allowedDevOrigins: ["127.0.0.1"],
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

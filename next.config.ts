import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  devIndicators: { position: "bottom-right" },
  // Pre-redesign addresses. Temporary (307) so they can change again without cached redirects.
  async redirects() {
    return [
      { source: "/jobs", destination: "/dashboard/jobs", permanent: false },
      { source: "/jobs/:id/requirements", destination: "/dashboard/jobs/:id/requirements", permanent: false },
      { source: "/dashboard/resume-review/:key", destination: "/dashboard/resumes/review/:key", permanent: false },
    ];
  },
  serverExternalPackages: ["unpdf"],
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  partialPrefetching: true,
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

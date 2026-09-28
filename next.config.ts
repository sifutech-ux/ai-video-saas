import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingIncludes: {
    '/api/stitch': ['./node_modules/ffmpeg-static/**/*'],
  },
};

export default nextConfig;

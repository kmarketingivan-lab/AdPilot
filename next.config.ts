import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: 'https' as const, hostname: 'res.cloudinary.com' },
      { protocol: 'https' as const, hostname: '*.googleusercontent.com' },
    ],
  },
};

export default nextConfig;

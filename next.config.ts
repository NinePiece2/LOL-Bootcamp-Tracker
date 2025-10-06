import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/noxelisdev/LoL_DDragon/master/extras/tier/**',
      },
    ],
  },
};

export default nextConfig;

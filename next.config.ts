import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/noxelisdev/LoL_DDragon/master/extras/tier/**',
      },
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
      },
      {
        protocol: 'https',
        hostname: 'opgg-static.akamaized.net',
      }
    ],
  },
};

export default nextConfig;

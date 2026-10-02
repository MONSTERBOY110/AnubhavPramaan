import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screens are captured for the deck and the video; the dev-mode badge must not appear in them.
  devIndicators: false,
};

export default nextConfig;

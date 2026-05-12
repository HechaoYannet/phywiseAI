import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@phywise/contracts",
    "@phywise/domain",
    "@phywise/whiteboard-schema",
    "@phywise/design-tokens"
  ]
};

export default nextConfig;


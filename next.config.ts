import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  // The Claude prompts are read from disk at run time (lib/tagging.ts,
  // recommend.ts, walk-buddy.ts), which file tracing can't see, so the
  // functions that call Claude get the folder explicitly.
  outputFileTracingIncludes: {
    "/api/telegram": ["./prompts/**/*"],
    "/api/cron/*": ["./prompts/**/*"],
  },
};

export default nextConfig;

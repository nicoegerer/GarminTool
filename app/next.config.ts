import type { NextConfig } from "next";

/**
 * Static export: every route is pre-rendered at build time and served from a
 * CDN (Cloudflare Pages). There is no server at runtime — Garmin data comes
 * from the JSON files under public/data/, and the AI providers are called
 * directly from the browser.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;

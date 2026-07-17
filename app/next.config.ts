import type { NextConfig } from "next";

/**
 * Static export: every route is pre-rendered at build time and served from a
 * CDN. There is no server at runtime — Garmin data comes from the JSON files
 * under public/data/, and Gemini is called directly from the browser.
 *
 * NEXT_PUBLIC_BASE_PATH is set by the Pages workflow to "/GarminTool", because
 * a project page is served from a subdirectory rather than the domain root.
 * Left empty locally so `npm run dev` stays at "/". Keep it in sync with
 * lib/paths.ts, which prefixes the data fetches Next doesn't rewrite.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
};

export default nextConfig;

/**
 * Where the app is mounted.
 *
 * On GitHub Pages the site lives at /GarminTool/, not at the domain root.
 * Next's `basePath` rewrites <Link> and static assets — but NOT `fetch()`, so
 * every data request has to be prefixed by hand. Doing it here means the
 * prefix is defined once and can't drift between call sites.
 *
 * Empty locally (`npm run dev`), set by the build for Pages.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL of an exported JSON file, e.g. dataUrl("manifest.json"). */
export function dataUrl(file: string): string {
  return `${BASE_PATH}/data/${file}`;
}

/**
 * Reads a CSS design token as a concrete colour, for canvas contexts that
 * can't use Tailwind classes.
 *
 * Lives apart from the chart components on purpose: chart.js and its zoom
 * plugin touch `window` at import time, so anything that pulls them in cannot
 * be imported by a prerendered page.
 */
export function themeToken(name: string, alpha = 1): string {
  if (typeof window === "undefined") return "#8a8a8a";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return "#8a8a8a";
  return alpha === 1 ? `hsl(${raw})` : `hsl(${raw} / ${alpha})`;
}

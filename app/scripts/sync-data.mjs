/**
 * Copies the exported Garmin JSON into public/ before dev and build.
 *
 * docs/data is the single source of truth (that's where the Python exporters
 * write). public/data is a build artefact and is gitignored, so the data lives
 * in exactly one place in the repo.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../docs/data");
const dest = resolve(here, "../public/data");

try {
  await stat(src);
} catch {
  console.error(`\n✗ Keine Daten unter ${src}\n  Erst "uv run scripts/export_data.py" ausfuehren.\n`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`✓ Daten kopiert: docs/data → public/data`);

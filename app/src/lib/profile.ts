import type { Profile } from "./types";

/** The Personal API's displayName can be an account UUID. Never greet that ID. */
export function athleteName(profile: Profile | null | undefined): string | undefined {
  if (typeof profile?.full_name !== "string") return undefined;
  const name = profile.full_name.trim();
  if (!name || /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(name)) return undefined;
  return name;
}

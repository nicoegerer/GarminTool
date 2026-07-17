"use client";

import { useCallback, useEffect, useState } from "react";

/** Everything Garmin can't tell us — the user fills this in under Einstellungen. */
export interface Race {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  sport?: string;
  priority?: "A" | "B" | "C";
  note?: string;
}

export interface UserPrefs {
  preferredSports: string[];
  weeklyHours: number | null;
  timePerSessionMin: number | null;
  goals: string;
  injuries: string;
  races: Race[];
}

export const DEFAULT_PREFS: UserPrefs = {
  preferredSports: [],
  weeklyHours: null,
  timePerSessionMin: null,
  goals: "",
  injuries: "",
  races: [],
};

const KEY = "gt_prefs";

function read(): UserPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UserPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  // Read after mount — localStorage doesn't exist during the static prerender.
  useEffect(() => {
    setPrefs(read());
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<UserPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* quota / private mode — keep the in-memory value */
      }
      return next;
    });
  }, []);

  return { prefs, update, ready };
}

export function loadPrefs(): UserPrefs {
  return read();
}

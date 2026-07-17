"use client";

import { useEffect, useState } from "react";

/**
 * Keeps a component mounted for `exitMs` after `open` flips to false, so its
 * closing animation can play before it leaves the DOM.
 *
 * This exists instead of motion's <AnimatePresence>. In this stack
 * (motion 12.42 + React 19.2 + Next 16) AnimatePresence runs the exit
 * animation but never unmounts the child. For an overlay that means a dead,
 * invisible backdrop keeps `pointer-events: auto` over the whole viewport —
 * close one sheet and the page stops responding to clicks.
 *
 * Owning the mount here is a few lines, deterministic, and testable.
 */
export function useMountTransition(open: boolean, exitMs: number): boolean {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return mounted;
}

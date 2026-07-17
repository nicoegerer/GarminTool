"use client";

import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { useMountTransition } from "@/lib/use-mount-transition";

const EXIT_MS = 240;

/** Mount is controlled here rather than by <AnimatePresence> — see useMountTransition. */
export function Modal({
  open,
  onClose,
  title,
  children,
  primaryLabel,
  onPrimary,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  const mounted = useMountTransition(open, EXIT_MS);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      style={{ pointerEvents: open ? "auto" : "none" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-lg p-7"
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3 className="mb-4 text-xl font-semibold tracking-tight">{title}</h3>
        <div className="space-y-3 text-sm leading-relaxed text-ink-2 [&_a]:text-gold [&_a]:underline-offset-2 [&_a:hover]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_input]:mt-2 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-line [&_input]:bg-surface-2 [&_input]:px-4 [&_input]:py-2.5 [&_input]:text-ink [&_input]:outline-none [&_input:focus]:border-gold/50">
          {children}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Abbrechen
          </button>
          {primaryLabel && (
            <button
              onClick={onPrimary}
              className="rounded-full bg-gold px-4 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 dark:text-black"
            >
              {primaryLabel}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

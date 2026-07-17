"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * The detail surface: every dashboard card opens one of these.
 * Side panel on desktop, bottom sheet with a drag-to-dismiss grip on mobile.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed z-[95] flex flex-col border-line-soft bg-bg
                       inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t
                       sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(560px,100vw)] sm:max-h-none sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-t-0"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              // Dismiss on a decisive downward flick or a long drag.
              if (info.offset.y > 130 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-3 sm:px-7 sm:pt-6">
              <div className="min-w-0 flex-1">
                {/* Grip: mobile affordance for the drag gesture */}
                <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line sm:hidden" />
                <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="mt-0.5 truncate text-sm text-ink-3">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Schließen"
              >
                <X className="size-[18px]" strokeWidth={1.8} />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-7"
              style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

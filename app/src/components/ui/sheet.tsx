"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useMountTransition } from "@/lib/use-mount-transition";

/** Matches the spring below; the sheet unmounts once it has settled off-screen. */
const EXIT_MS = 420;

/**
 * The detail surface: every dashboard card opens one of these.
 * Side panel on desktop, bottom sheet with drag-to-dismiss on mobile.
 *
 * Mounting is controlled by useMountTransition rather than <AnimatePresence> —
 * see that hook for why. Enter/exit `y` lives on the panel while the drag
 * gesture's `y` lives on the layer inside it: on one element the drag captures
 * the motion value and the close animation can't drive it.
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
  const mounted = useMountTransition(open, EXIT_MS);

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

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[90]"
      // While closing, stop swallowing clicks the moment the user asks to leave.
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Enter/exit layer */}
      <motion.div
        className="absolute flex flex-col
                   inset-x-0 bottom-0 max-h-[92dvh]
                   sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(560px,100vw)] sm:max-h-none"
        initial={{ y: "100%" }}
        animate={{ y: open ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 36 }}
      >
        {/* Drag layer */}
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex min-h-0 flex-1 flex-col border-line-soft bg-bg
                     rounded-t-3xl border-t
                     sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-t-0"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            // Dismiss on a decisive flick or a long pull.
            if (info.offset.y > 130 || info.velocity.y > 600) onClose();
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-3 sm:px-7 sm:pt-6">
            <div className="min-w-0 flex-1">
              {/* Grip: the affordance for the drag gesture */}
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
      </motion.div>
    </div>
  );
}

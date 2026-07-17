"use client";

import { useEffect, useRef } from "react";

/**
 * The living backdrop: a mesh of slow-drifting light with a scroll-linked
 * parallax, over a fine grain that kills the banding big blurs produce.
 *
 * Deliberately free of motion/react. Two of its hooks are broken in this stack
 * (motion 12.42 + React 19.2 + Next 16): <AnimatePresence> never unmounts, and
 * useScroll() never feeds its MotionValue, which left the parallax at
 * `transform: none` forever. The drift is CSS keyframes (GPU-composited, and
 * honours the global prefers-reduced-motion rule for free) and the parallax is
 * a passive scroll listener writing one custom property per frame.
 */
export function Background() {
  const fastRef = useRef<HTMLDivElement>(null);
  const slowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Respect the OS setting: no scroll-linked movement when motion is reduced.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      fastRef.current?.style.setProperty("--parallax", `${(-y * 0.11).toFixed(2)}px`);
      slowRef.current?.style.setProperty("--parallax", `${(-y * 0.05).toFixed(2)}px`);
    };
    const onScroll = () => {
      // Coalesce to one write per frame — scroll fires far more often than that.
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Base wash — keeps the corners from going flat */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,hsl(var(--bg-deep))_0%,hsl(var(--bg))_60%)]" />

      <div ref={fastRef} className="parallax absolute inset-0">
        <div className="orb orb-a absolute -right-[14vw] -top-[18vw] size-[58vw] rounded-full bg-gold/[0.15] blur-[100px]" />
        <div className="orb orb-b absolute -left-[16vw] top-[38vh] size-[52vw] rounded-full bg-sport-ride/[0.11] blur-[100px]" />
      </div>

      <div ref={slowRef} className="parallax absolute inset-0">
        <div className="orb orb-c absolute -bottom-[20vw] right-[6vw] size-[46vw] rounded-full bg-sport-swim/[0.10] blur-[100px]" />
      </div>

      <div className="noise-grain absolute inset-0" />
    </div>
  );
}

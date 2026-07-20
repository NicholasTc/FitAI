"use client";

import { useEffect, useRef, useState } from "react";

interface ReadinessOrbProps {
  /** 0–100 readiness score shown in the orb centre. */
  score: number;
  /** Small uppercase label above the number (e.g. "Readiness", "Sleep duration"). */
  label: string;
  /** One-word status under the number (e.g. "Good"). */
  status: string;
  /** Amber status colour instead of lime (used for low / caution states). */
  caution?: boolean;
  /**
   * Optional custom big value renderer. When provided it replaces the numeric
   * count-up (used on sub-screens that show e.g. "7h 32m" instead of a score).
   */
  bigValue?: React.ReactNode;
  /**
   * Skip the concentric particle halo. Used for orbs shown alongside the main
   * Home hero (e.g. Stimulus Reserve on Health) so they read as a distinct,
   * smaller instrument rather than a second hero.
   */
  hideHalo?: boolean;
  /**
   * Render an animated liquid level inside the glass shell, filled to `score`%,
   * instead of relying only on the numeric readout. Used for capacity/reserve
   * style metrics where "how full" is the primary thing being communicated.
   */
  liquid?: boolean;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The FitAI glass readiness orb — a premium translucent sphere with a
 * concentric particle halo, restrained lime energy at its base, and subtle
 * idle-breathe animation. Visual is a faithful port of proposal8-glass-orb.
 */
export default function ReadinessOrb({
  score,
  label,
  status,
  caution,
  bigValue,
  hideHalo,
  liquid,
}: ReadinessOrbProps) {
  const haloRef = useRef<SVGGElement | null>(null);
  const [display, setDisplay] = useState(() =>
    prefersReducedMotion() ? score : 0,
  );

  // Generate the concentric particle halo once (skipped entirely when hidden).
  useEffect(() => {
    if (hideHalo) return;
    const g = haloRef.current;
    if (!g || g.childNodes.length > 0) return;
    const NS = "http://www.w3.org/2000/svg";
    const CX = 190;
    const CY = 190;
    const rings = [
      { r: 112, n: 42, s: 1.0 },
      { r: 126, n: 48, s: 0.85 },
      { r: 142, n: 54, s: 0.68 },
      { r: 160, n: 58, s: 0.52 },
      { r: 180, n: 62, s: 0.38 },
    ];
    rings.forEach((ring, ri) => {
      for (let i = 0; i < ring.n; i++) {
        const a =
          (i / ring.n) * Math.PI * 2 + ri * 0.35 + (Math.random() - 0.5) * 0.07;
        const r = ring.r + (Math.random() - 0.5) * 7;
        const bottom = (1 + Math.sin(a)) / 2;
        const hue = 205 - 125 * bottom;
        let op = ring.s * (0.24 + 0.62 * bottom) * (0.6 + Math.random() * 0.4);
        let rad = (0.45 + Math.random() * 0.75) * (0.72 + 0.5 * bottom);
        if (Math.random() < 0.04) {
          rad += 0.7;
          op = Math.min(1, op + 0.25);
        }
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", (CX + r * Math.cos(a)).toFixed(1));
        c.setAttribute("cy", (CY + r * Math.sin(a)).toFixed(1));
        c.setAttribute("r", rad.toFixed(2));
        c.setAttribute("fill", `hsl(${hue.toFixed(0)}, 55%, 76%)`);
        c.setAttribute("opacity", op.toFixed(2));
        g.appendChild(c);
      }
    });
  }, []);

  // Count-up reveal to the real score (skipped for reduced motion / custom value).
  useEffect(() => {
    if (bigValue !== undefined) return;
    if (prefersReducedMotion()) {
      setDisplay(score);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const dur = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (score - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, bigValue]);

  // Liquid fill level — animates 0 → score independently of the number
  // counter above (bigValue usages skip that counter, but still want the fill).
  const [liquidLevel, setLiquidLevel] = useState(0);
  useEffect(() => {
    if (!liquid) return;
    if (prefersReducedMotion()) {
      setLiquidLevel(score);
      return;
    }
    const raf = requestAnimationFrame(() => setLiquidLevel(score));
    return () => cancelAnimationFrame(raf);
  }, [liquid, score]);

  const numMid = bigValue === undefined && String(score).length >= 3;

  return (
    <div className={hideHalo ? "hero hero-compact" : "hero"}>
      {!hideHalo && (
        <svg className="orb-halo" viewBox="0 0 380 380" aria-hidden="true">
          <g ref={haloRef} />
        </svg>
      )}
      <div className={`orb-wrap${liquid ? " tank" : ""}`}>
        <div className="orb-glow" />
        <div className="orb-ring-glow" />
        <div className="orb">
          {liquid && (
            <div
              className={`orb-liquid${caution ? " caution" : ""}`}
              style={{ height: `${Math.max(0, Math.min(100, liquidLevel))}%` }}
            >
              <div className="orb-liquid-glint" />
              <div className="orb-liquid-surface">
                <svg viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0,10 C25,0 75,0 100,10 C125,20 175,20 200,10 C225,0 275,0 300,10 C325,20 375,20 400,10 L400,20 L0,20 Z" />
                </svg>
                <svg viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0,10 C25,0 75,0 100,10 C125,20 175,20 200,10 C225,0 275,0 300,10 C325,20 375,20 400,10 L400,20 L0,20 Z" />
                </svg>
              </div>
              <div className="orb-liquid-body" />
            </div>
          )}
          <div className="orb-fresnel" />
          <div className="orb-rim" />
        </div>
      </div>
      <div className="orb-score">
        <div className="lbl">{label}</div>
        <div className={`num${numMid ? " mid" : ""}`}>
          {bigValue !== undefined ? bigValue : display}
        </div>
        <div className={`status orb-reveal${caution ? " caution" : ""}`}>
          {status}
        </div>
      </div>
    </div>
  );
}

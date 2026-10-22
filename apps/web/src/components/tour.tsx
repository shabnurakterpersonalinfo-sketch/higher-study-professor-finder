'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tour } from '@/lib/tours';
import { cx } from './ui';

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_W = 340;
const WAIT_MS = 4000;

const find = (target?: string) => (target ? (document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null) : null);
const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  // Off-canvas elements (the mobile sidebar) count as hidden.
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
};

/** Padded box around the element, clipped to the visible area so the card stays on screen. */
function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const top = Math.max(8, r.top - PAD);
  const bottom = Math.min(window.innerHeight - 8, r.bottom + PAD);
  return { top, left: r.left - PAD, width: r.width + PAD * 2, height: Math.max(0, bottom - top) };
}

/**
 * Spotlight tour. The page dims except for a rounded cut-out around the current
 * element, which glides to the next one; a dark card explains it. Steps whose
 * element never appears (empty state, hidden on mobile) are skipped.
 * Keys: → next, ← back, Esc skip.
 */
export function TourOverlay({ tour, onDone }: { tour: Tour; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = tour.steps[i];
  const last = i === tour.steps.length - 1;

  const go = useCallback(
    (d: 1 | -1) => {
      setDir(d);
      const n = i + d;
      if (n >= tour.steps.length) onDone();
      else if (n >= 0) setI(n);
    },
    [i, tour.steps.length, onDone],
  );

  // Locate the target (waiting for the page to load it), scroll it into view, measure.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!step.target) {
      setRect(null);
      setReady(true);
      return;
    }
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const el = find(step.target);
      if (el && visible(el)) {
        // Tall elements (a filter column) are aligned to the top instead of centred, below the sticky bar.
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
        if (tall) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 88, behavior: 'smooth' });
        else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => {
          if (cancelled) return;
          setRect(measure(el));
          setReady(true);
        }, 320);
      } else if (Date.now() - started > (i === 0 ? WAIT_MS : 600)) {
        // Not on this screen right now — skip in the direction we were going.
        const n = i + dir;
        if (n >= tour.steps.length || n < 0) onDone();
        else setI(n);
      } else setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [i, step.target, dir, tour.steps.length, onDone]);

  // Follow the element on resize / scroll.
  useEffect(() => {
    if (!step.target || !ready) return;
    const update = () => {
      const el = find(step.target);
      if (!el) return;
      setRect(measure(el));
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target, ready]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft' && i > 0) go(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go, i, onDone]);

  useLayoutEffect(() => {
    if (ready) cardRef.current?.focus({ preventScroll: true });
  }, [ready, i]);

  if (!ready && i === 0) return null; // waiting for the page; don't flash an empty overlay

  // Place the card beside the spotlight where it fits: below, above, right, then left.
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  let pos: React.CSSProperties;
  if (!rect) pos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  else {
    const cardH = 210;
    const clampX = (x: number) => Math.max(16, Math.min(x, vw - w - 16));
    if (rect.top + rect.height + 12 + cardH < vh) pos = { top: rect.top + rect.height + 12, left: clampX(rect.left) };
    else if (rect.top - 12 - cardH > 0) pos = { top: rect.top - 12 - cardH, left: clampX(rect.left) };
    else if (rect.left + rect.width + 12 + w < vw) pos = { top: Math.max(16, Math.min(rect.top, vh - cardH - 16)), left: rect.left + rect.width + 12 };
    else pos = { top: Math.max(16, Math.min(rect.top, vh - cardH - 16)), left: clampX(rect.left - w - 12) };
  }

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Dim layer with a cut-out. Without a target the whole page dims evenly. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-brand-300/80 transition-all duration-300 ease-out"
          style={{ ...rect, boxShadow: '0 0 0 9999px rgba(28,31,58,0.55)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#1C1F3A]/55 transition-opacity" />
      )}
      {/* Blocks clicks on the page while the tour is open. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-labelledby="tour-title"
        className={cx('absolute animate-fade-up rounded-2xl bg-night p-5 text-white shadow-pop outline-none transition-[top,left] duration-300 ease-out', !ready && 'opacity-0')}
        style={{ ...pos, width: w }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-[17px] font-semibold leading-snug">{step.title}</h2>
          <button onClick={onDone} className="-mr-1 -mt-1 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-brand-100">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          {tour.steps.length > 1 ? (
            <div className="flex items-center gap-1.5" aria-label={`Step ${i + 1} of ${tour.steps.length}`}>
              {tour.steps.map((_, n) => (
                <span key={n} className={cx('h-1.5 rounded-full transition-all', n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/30')} />
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {i > 0 ? (
              <button onClick={() => go(-1)} className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            ) : (
              tour.steps.length > 1 && (
                <button onClick={onDone} className="h-9 rounded-xl px-3 text-sm text-white/70 hover:bg-white/10 hover:text-white">
                  Skip tour
                </button>
              )
            )}
            <button onClick={() => go(1)} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-4 text-sm font-semibold text-night hover:bg-brand-50">
              {last ? 'Got it' : <>Next <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

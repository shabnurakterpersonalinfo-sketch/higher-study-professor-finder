'use client';

import { usePathname } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TourOverlay } from '@/components/tour';
import { api } from './api';
import { useAuth } from './auth';
import { Tour, tourForPath, TOURS } from './tours';
import type { Plan } from './types';

export interface FeatureHighlight {
  id: string;
  title: string;
  body: string;
  href: string;
  minPlan: Plan;
  reason: 'NEW' | 'UNLOCKED';
}
export interface OnboardingState {
  setup: { required: boolean; done: boolean; completedAt: string | null; missing: string[] };
  toursSeen: string[];
  features: FeatureHighlight[];
}

interface Ctx {
  state: OnboardingState | null;
  /** Highlight for a menu route, if any. */
  featureFor: (href: string) => FeatureHighlight | undefined;
  /** Run the tour for the current screen again (the ? button). */
  replay: () => void;
  hasTour: boolean;
  resetTours: () => Promise<void>;
  reload: () => Promise<void>;
}

const OnboardingCtx = createContext<Ctx | null>(null);

/**
 * Decides which tour to show. On every screen change, for a student who has
 * finished setup:
 *   1. an unseen "New" feature whose menu route is this screen → its feature tour;
 *   2. otherwise this screen's first-visit tour, if not seen yet.
 * Finishing or skipping marks it seen on the server, so it won't show on
 * another device either.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const path = usePathname();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [active, setActive] = useState<{ tour: Tour; featureId?: string; screen?: string } | null>(null);
  const started = useRef<string | null>(null);

  const isStudent = me?.role === 'GU' && me.setupDone;

  const reload = useCallback(async () => {
    if (!me || me.role !== 'GU' || !me.setupDone) return setState(null);
    setState(await api<OnboardingState>('/onboarding').catch(() => null));
  }, [me]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Pick a tour when the screen changes.
  useEffect(() => {
    if (!isStudent || !state || active) return;
    const screen = tourForPath(path);
    const key = `${path}`;
    if (started.current === key) return;
    const feature = state.features.find((f) => f.href === path && TOURS[`feature:${f.id}`]);
    if (feature) {
      started.current = key;
      setActive({ tour: TOURS[`feature:${feature.id}`], featureId: feature.id, screen: screen ?? undefined });
    } else if (screen && !state.toursSeen.includes(screen)) {
      started.current = key;
      setActive({ tour: TOURS[screen], screen });
    }
  }, [path, state, isStudent, active]);

  // A new screen resets the "already started here" memo.
  useEffect(() => {
    if (started.current && started.current !== path) started.current = null;
  }, [path]);

  const finish = useCallback(async () => {
    if (!active) return;
    const { featureId, screen, tour } = active;
    setActive(null);
    // A feature tour also counts as this screen's intro, so it isn't followed by a second tour.
    const tours = [tour.id.startsWith('feature:') ? null : tour.id, featureId ? screen : null].filter(Boolean) as string[];
    setState((s) =>
      s && {
        ...s,
        toursSeen: [...new Set([...s.toursSeen, ...tours])],
        features: featureId ? s.features.filter((f) => f.id !== featureId) : s.features,
      },
    );
    await Promise.all([
      ...tours.map((id) => api(`/onboarding/tours/${encodeURIComponent(id)}/seen`, { method: 'POST' }).catch(() => null)),
      featureId ? api(`/onboarding/features/${featureId}/seen`, { method: 'POST' }).catch(() => null) : null,
    ]);
  }, [active]);

  const screenTour = tourForPath(path);
  const value = useMemo<Ctx>(
    () => ({
      state,
      featureFor: (href) => state?.features.find((f) => f.href === href),
      hasTour: !!screenTour,
      replay: () => screenTour && setActive({ tour: TOURS[screenTour], screen: screenTour }),
      resetTours: async () => {
        await api('/onboarding/tours', { method: 'DELETE' });
        setState((s) => s && { ...s, toursSeen: [] });
        started.current = null;
      },
      reload,
    }),
    [state, screenTour, reload],
  );

  return (
    <OnboardingCtx.Provider value={value}>
      {children}
      {active && <TourOverlay key={active.tour.id} tour={active.tour} onDone={finish} />}
    </OnboardingCtx.Provider>
  );
}

export function useOnboarding() {
  const c = useContext(OnboardingCtx);
  if (!c) throw new Error('useOnboarding outside OnboardingProvider');
  return c;
}

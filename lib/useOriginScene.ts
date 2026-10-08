'use client';

import { useCallback, useState } from 'react';
import { ALREADY_SETTLED, sceneNow } from './AnimatedArcLayer';
import type { City, Origin } from './cities';

/** An origin as the display holds it: one entry per unique city. */
export type SceneOrigin = Origin & {
  /** Scene-clock time this arc starts drawing. */
  animStart: number;
  /** How many people have submitted this city. */
  submissions: number;
};

/**
 * Holds what the globe is currently showing.
 *
 * The render dedupes but the database would not (PLAN.md 1.5): every submission
 * is a row, while the display keeps one arc per unique city. A repeat
 * submission rewrites that arc's start time so the same animation runs again,
 * rather than stacking a second arc on identical coordinates where it would
 * burn fill rate and z-fight for no visual gain.
 */
export function useOriginScene() {
  const [origins, setOrigins] = useState<SceneOrigin[]>([]);

  const submit = useCallback((city: City, options?: { settled?: boolean }) => {
    // Hydrated backlog renders in its final state with no replay animation,
    // which is what makes a display refresh self-healing rather than a visible
    // restart of the whole event.
    const animStart = options?.settled ? ALREADY_SETTLED : sceneNow();

    setOrigins((previous) => {
      const index = previous.findIndex((o) => o.cityKey === city.cityKey);

      if (index === -1) {
        return [
          ...previous,
          { ...city, submittedAt: Date.now(), animStart, submissions: 1 },
        ];
      }

      const next = [...previous];
      next[index] = {
        ...next[index],
        submittedAt: Date.now(),
        animStart,
        submissions: next[index].submissions + 1,
      };
      return next;
    });
  }, []);

  /**
   * Replace the whole scene with the backlog, drawn in its settled state.
   *
   * Deliberately a wholesale set rather than a loop of submit() calls: that
   * makes it idempotent, so a double-invoked effect, a reconnect that refetches,
   * or a retried hydration cannot duplicate entries.
   */
  const hydrate = useCallback(
    (backlog: { city: City; submissions: number }[]) => {
      setOrigins(
        backlog.map(({ city, submissions }) => ({
          ...city,
          submittedAt: Date.now(),
          animStart: ALREADY_SETTLED,
          submissions,
        }))
      );
    },
    []
  );

  return { origins, submit, hydrate };
}

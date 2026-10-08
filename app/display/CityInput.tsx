'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCities, type City } from '@/lib/cities';

type Props = {
  onSubmit: (city: City) => void;
  /** City to keep out of the results, i.e. the event location itself. */
  excludeKey?: string;
  /** How long the thank-you stays up before the field resets for the next person. */
  confirmationMs?: number;
};

/**
 * Visitor entry. Selection-only by design: the attendee picks from the dataset
 * and never submits free text, so no attendee-authored string can reach the
 * projection and there is no moderation queue to staff (PLAN.md 1.5).
 *
 * Lives on the display page for this test build. It is self-contained so it can
 * move to a /kiosk route unchanged once there are real kiosk devices.
 */
export default function CityInput({
  onSubmit,
  excludeKey,
  confirmationMs = 4500,
}: Props) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [confirmed, setConfirmed] = useState<City | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchCities(query, { exclude: excludeKey }),
    [query, excludeKey]
  );

  // Reset to idle so the kiosk is ready for the next person without anyone
  // having to clear the field.
  useEffect(() => {
    if (!confirmed) return;
    const timer = setTimeout(() => setConfirmed(null), confirmationMs);
    return () => clearTimeout(timer);
  }, [confirmed, confirmationMs]);

  function choose(city: City) {
    onSubmit(city);
    setConfirmed(city);
    setQuery('');
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setQuery('');
      return;
    }
    if (!results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[highlight]);
    }
  }

  if (confirmed) {
    return (
      <Panel>
        <div className="px-7 py-6 text-center">
          <p className="text-xs tracking-[0.25em] text-amber-200/85 uppercase">
            Now boarding
          </p>
          <p className="mt-2 text-2xl font-medium text-white">
            {confirmed.cityName}
          </p>
          <p className="mt-1 text-sm text-white/60">
            {confirmed.country} · welcome to Chicago
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      {/* Suggestions open upward: the panel sits at the bottom of the screen. */}
      {results.length > 0 && (
        <ul className="max-h-72 overflow-y-auto border-b border-white/15">
          {results.map((city, index) => (
            <li key={city.cityKey}>
              <button
                type="button"
                // Commit on mousedown so the field's blur can't beat the click.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(city);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex w-full items-baseline justify-between gap-4 px-7 py-3.5 text-left transition ${
                  index === highlight ? 'bg-amber-300/25' : 'hover:bg-white/10'
                }`}
              >
                <span className="text-lg text-white">{city.cityName}</span>
                <span className="text-xs tracking-wide text-white/55">
                  {city.country}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-7 py-5">
        <label
          htmlFor="city"
          className="block text-xs tracking-[0.25em] text-amber-200/75 uppercase"
        >
          Where are you flying in from?
        </label>
        <input
          id="city"
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // Reset the selection alongside the query rather than in an effect,
            // so typing never renders a stale highlight for a frame.
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Start typing your city"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full bg-transparent text-2xl text-white placeholder:text-white/45 focus:outline-none"
        />
        {query.length > 0 && results.length === 0 && (
          <p className="mt-2 text-sm text-white/50">
            No match for “{query}” yet — try the nearest major city.
          </p>
        )}
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[min(34rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-amber-200/25 bg-[#0c1423]/95 shadow-2xl shadow-black/70 backdrop-blur-md transition-colors focus-within:border-amber-200/50">
      {children}
    </div>
  );
}

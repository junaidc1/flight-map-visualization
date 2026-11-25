'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { COORDINATE_SYSTEM, _GlobeView as GlobeView } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import AnimatedArcLayer from '@/lib/AnimatedArcLayer';
import { useOriginScene, type SceneOrigin } from '@/lib/useOriginScene';
import {
  angularDistance,
  easeInOutCubic,
  greatCircleMidpoint,
  shortestLongitudeDelta,
  wrapLongitude,
} from '@/lib/geo';
import {
  ARC_DRAW_MS,
  ARC_HEIGHT,
  DESTINATION,
  FOCUS_HOLD_MS,
  FOCUS_GLOBE_FILL_LONG,
  FOCUS_GLOBE_FILL_SHORT,
  FOCUS_TRANSITION_MS,
  GLOBE_RESOLUTION_DEGREES,
  IDLE_GLOBE_FILL,
  IDLE_VIEW_STATE,
  MAX_LISTED_CITIES,
  PALETTE,
  RESUME_SPIN_AFTER_IDLE_MS,
  RETURN_TRANSITION_MS,
  SPHERE_RADIUS_M,
  SPIN_DEGREES_PER_SECOND,
  zoomForGlobeFill,
} from '@/lib/config';
import { LONDON, type City } from '@/lib/cities';
import CityInput from './CityInput';

const DEST_POSITION: [number, number] = [DESTINATION.lng, DESTINATION.lat];

type ViewState = { longitude: number; latitude: number; zoom: number };

/**
 * What the camera is doing. Held in a ref rather than state: it changes on
 * interaction and on a timer, and nothing in the render tree depends on it.
 */
type CameraCommand =
  | { mode: 'spin' }
  /** A visitor has taken the wheel, or we're dwelling on a finished route. */
  | { mode: 'hold' }
  | {
      mode: 'focus';
      from: ViewState;
      to: ViewState;
      startedAt: number;
      durationMs: number;
      onArrive: () => void;
    };

/**
 * The projected display. Mounted client-only (see page.tsx) because deck.gl
 * needs a real WebGL context.
 */
export default function DisplayCanvas() {
  const [worldLoaded, setWorldLoaded] = useState(false);
  const { origins, submit, hydrate } = useOriginScene();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  // ?hydrated=1 stands in for a display refresh mid-event: the backlog appears
  // instantly in its settled state instead of replaying (PLAN.md core req 3).
  const hydrated = params.has('hydrated');
  // ?demo=1 flies London in by itself, for hands-free checking.
  const demo = params.has('demo');

  const [viewState, setViewStateInternal] = useState<ViewState>(IDLE_VIEW_STATE);
  const viewStateRef = useRef<ViewState>(IDLE_VIEW_STATE);
  const cameraRef = useRef<CameraCommand>({ mode: 'spin' });
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyViewState = useCallback((next: ViewState) => {
    viewStateRef.current = next;
    setViewStateInternal(next);
  }, []);

  // Zoom levels that frame the globe nicely for whatever screen we're on.
  const fitRef = useRef({
    idle: IDLE_VIEW_STATE.zoom,
    viewportMin: 1000,
  });

  useEffect(() => {
    const recompute = () => {
      const smallest = Math.min(window.innerWidth, window.innerHeight);
      fitRef.current = {
        idle: zoomForGlobeFill(smallest, IDLE_GLOBE_FILL),
        viewportMin: smallest,
      };
      // Don't yank the camera mid-flight; the focus move reads the new value
      // when it next runs.
      if (cameraRef.current.mode !== 'focus') {
        applyViewState({ ...viewStateRef.current, zoom: fitRef.current.idle });
      }
    };

    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [applyViewState]);

  /**
   * Ease back to the default framing, then hand over to the idle spin.
   *
   * With no `center` the globe keeps whatever meridian it is showing and only
   * restores latitude and zoom, so an automatic return doesn't lurch sideways
   * unprompted. The reset control passes a centre explicitly.
   */
  const returnToDefault = useCallback(
    (options?: { center?: { lat: number; lng: number } }) => {
      const from = viewStateRef.current;
      const center = options?.center;
      cameraRef.current = {
        mode: 'focus',
        from,
        to: {
          longitude: center
            ? from.longitude +
              shortestLongitudeDelta(from.longitude, center.lng)
            : from.longitude,
          latitude: center ? center.lat : IDLE_VIEW_STATE.latitude,
          zoom: fitRef.current.idle,
        },
        startedAt: performance.now(),
        durationMs: RETURN_TRANSITION_MS,
        onArrive: () => {
          cameraRef.current = { mode: 'spin' };
        },
      };
    },
    []
  );

  const scheduleSpinResume = useCallback(
    (delayMs: number) => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => returnToDefault(), delayMs);
    },
    [returnToDefault]
  );

  /** Reset control: bring the globe back to the event location and resume spin. */
  const resetView = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    returnToDefault({ center: DESTINATION });
  }, [returnToDefault]);

  /** A visitor touched the globe: stop spinning, and hand it back when idle. */
  const takeManualControl = useCallback(() => {
    cameraRef.current = { mode: 'hold' };
    scheduleSpinResume(RESUME_SPIN_AFTER_IDLE_MS);
  }, [scheduleSpinResume]);

  // One animation loop drives both the idle rotation and the focus moves, so
  // the two can never fight over the camera.
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      // Cap the step so a backgrounded tab doesn't resume with a huge jump.
      const deltaSeconds = Math.min((now - previous) / 1000, 0.1);
      previous = now;

      const command = cameraRef.current;

      if (command.mode === 'spin') {
        const current = viewStateRef.current;
        applyViewState({
          ...current,
          longitude: wrapLongitude(
            current.longitude + SPIN_DEGREES_PER_SECOND * deltaSeconds
          ),
        });
      } else if (command.mode === 'focus') {
        const progress = Math.min(
          1,
          (now - command.startedAt) / command.durationMs
        );
        const eased = easeInOutCubic(progress);
        const { from, to } = command;

        applyViewState({
          longitude: wrapLongitude(
            from.longitude + (to.longitude - from.longitude) * eased
          ),
          latitude: from.latitude + (to.latitude - from.latitude) * eased,
          zoom: from.zoom + (to.zoom - from.zoom) * eased,
        });

        if (progress >= 1) {
          cameraRef.current = { mode: 'hold' };
          command.onArrive();
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [applyViewState]);

  useEffect(
    () => () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    },
    []
  );

  /**
   * Swing the globe round so the whole route is in frame, start the arc once
   * the camera arrives, then hand back to the idle spin.
   */
  const handleSubmit = useCallback(
    (city: City) => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);

      const midpoint = greatCircleMidpoint(city, DESTINATION);
      const from = viewStateRef.current;

      // Frame the route by how far it actually travels, so a long haul pulls
      // the camera back rather than pushing its endpoints onto the limb.
      const spread = angularDistance(city, DESTINATION) / Math.PI;
      const fill =
        FOCUS_GLOBE_FILL_SHORT +
        (FOCUS_GLOBE_FILL_LONG - FOCUS_GLOBE_FILL_SHORT) * spread;

      cameraRef.current = {
        mode: 'focus',
        from,
        to: {
          // Unwrapped relative to where we are, so the globe turns the short
          // way round rather than unspooling 340 degrees the other way.
          longitude:
            from.longitude +
            shortestLongitudeDelta(from.longitude, midpoint.lng),
          latitude: midpoint.lat,
          zoom: zoomForGlobeFill(fitRef.current.viewportMin, fill),
        },
        startedAt: performance.now(),
        durationMs: FOCUS_TRANSITION_MS,
        onArrive: () => {
          submit(city);
          scheduleSpinResume(ARC_DRAW_MS + FOCUS_HOLD_MS);
        },
      };
    },
    [scheduleSpinResume, submit]
  );

  useEffect(() => {
    if (hydrated) {
      hydrate([{ city: LONDON, submissions: 1 }]);
      return;
    }
    if (!demo) return;
    const timer = setTimeout(() => handleSubmit(LONDON), 1200);
    return () => clearTimeout(timer);
  }, [demo, handleSubmit, hydrate, hydrated]);

  // Most recently active first, so a new arrival appears at the top of the list
  // rather than somewhere in the middle of it.
  const recentCities = [...origins]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, MAX_LISTED_CITIES);
  const unlistedCount = origins.length - recentCities.length;

  const layers = [
    // The sphere is what makes the globe read as solid, and it is also what
    // occludes arcs on the far side.
    new SimpleMeshLayer({
      id: 'ocean-sphere',
      data: [0],
      mesh: new SphereGeometry({
        radius: SPHERE_RADIUS_M,
        nlat: 48,
        nlong: 96,
      }),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: () => [0, 0, 0],
      getColor: PALETTE.ocean,
      // Flat fill rather than a lit surface: this is a graphic, not a render.
      material: false,
      pickable: false,
    }),

    new GeoJsonLayer({
      id: 'world',
      // Pre-converted at build time from the world-atlas npm package. No tile
      // service, no API token, nothing to rate-limit (PLAN.md 1.2).
      data: '/world-countries-110m.geojson',
      filled: true,
      stroked: true,
      getFillColor: PALETTE.land,
      getLineColor: PALETTE.landBorder,
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      pickable: false,
      onDataLoad: () => setWorldLoaded(true),
    }),

    new AnimatedArcLayer<SceneOrigin>({
      id: 'routes',
      data: origins,
      greatCircle: true,
      getSourcePosition: (d) => [d.lng, d.lat],
      getTargetPosition: () => DEST_POSITION,
      getSourceColor: PALETTE.arcSettled,
      getTargetColor: PALETTE.arcHot,
      getStartTime: (d) => d.animStart,
      getHeight: ARC_HEIGHT,
      drawDurationMs: ARC_DRAW_MS,
      widthUnits: 'pixels',
      getWidth: 2,
      pickable: false,
      updateTriggers: {
        // Replaying a repeat city rewrites animStart in place, so the attribute
        // has to be re-uploaded when it changes.
        getStartTime: origins.map((o) => o.animStart).join(','),
      },
    }),

    new ScatterplotLayer<SceneOrigin>({
      id: 'origin-dots',
      data: origins,
      getPosition: (d) => [d.lng, d.lat],
      getFillColor: PALETTE.origin,
      radiusUnits: 'pixels',
      getRadius: 3,
      pickable: false,
    }),

    new ScatterplotLayer({
      id: 'destination-dot',
      data: [DESTINATION],
      getPosition: () => DEST_POSITION,
      getFillColor: PALETTE.destination,
      radiusUnits: 'pixels',
      getRadius: 5,
      pickable: false,
    }),
  ];

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: `rgb(${PALETTE.background.join(',')})` }}
    >
      {/* Wrapper catches taps on the globe itself. Overlay siblings below are
          outside it, so using the input doesn't count as grabbing the globe. */}
      <div className="absolute inset-0" onPointerDown={takeManualControl}>
        <DeckGL
          views={new GlobeView({ resolution: GLOBE_RESOLUTION_DEGREES })}
          viewState={viewState}
          onViewStateChange={({ viewState: next, interactionState }) => {
            const vs = next as ViewState;
            applyViewState({
              longitude: vs.longitude,
              latitude: vs.latitude,
              zoom: vs.zoom,
            });
            if (interactionState.isDragging || interactionState.isZooming) {
              takeManualControl();
            }
          }}
          // Double-click zoom is a stray-input hazard on a touch display.
          controller={{ doubleClickZoom: false }}
          layers={layers}
          // deck.gl 9.4 ships a default widget set. A projection carries no chrome.
          widgets={[]}
        />
      </div>

      {!worldLoaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-xs tracking-[0.2em] text-white/25 uppercase">
            Loading globe
          </p>
        </div>
      )}

      {origins.length > 0 && (
        <div className="pointer-events-none absolute top-10 left-10 font-mono">
          <p className="text-3xl tracking-tight text-white/60 tabular-nums">
            {origins.length}
            <span className="ml-2 text-xs tracking-[0.2em] text-white/30 uppercase">
              {origins.length === 1 ? 'city' : 'cities'}
            </span>
          </p>
          <p className="mt-1 text-xs tracking-[0.2em] text-white/30 uppercase">
            arriving {DESTINATION.cityName}
          </p>

          <ul className="mt-6 space-y-1.5">
            {recentCities.map((origin) => (
              <li
                key={origin.cityKey}
                className="text-sm leading-tight text-white/65"
              >
                {origin.cityName}
                {origin.submissions > 1 && (
                  <span className="ml-2 text-xs text-[#a4ebff]/50">
                    ×{origin.submissions}
                  </span>
                )}
              </li>
            ))}
            {unlistedCount > 0 && (
              <li className="pt-1 text-xs tracking-[0.15em] text-white/25 uppercase">
                +{unlistedCount} more
              </li>
            )}
          </ul>
        </div>
      )}

      <button
        onClick={resetView}
        className="absolute top-10 right-10 rounded-full border border-white/10 px-4 py-2 text-xs tracking-[0.2em] text-white/30 uppercase transition hover:border-white/25 hover:text-white/70"
      >
        Reset view
      </button>

      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-10">
        <CityInput onSubmit={handleSubmit} excludeKey={DESTINATION.cityKey} />
      </div>

      {/* Sits in the strip below the input panel's bottom edge rather than
          beside it, so the two can't collide on a narrow screen. The wrapper
          ignores pointer events so it never swallows a drag on the globe; only
          the link itself is clickable. */}
      <p className="pointer-events-none absolute right-6 bottom-4 font-mono text-[11px] tracking-wide text-white/25">
        © 2026 JOONS Studio{' | '}
        <a
          href="https://joons.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto underline decoration-white/20 underline-offset-2 transition hover:text-[#a4ebff] hover:decoration-[#a4ebff]/50"
        >
          joons.studio
        </a>
      </p>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import AnimatedArcLayer from '@/lib/AnimatedArcLayer';
import { useOriginScene, type SceneOrigin } from '@/lib/useOriginScene';
import { easeInOutCubic } from '@/lib/geo';
import {
  ARC_DRAW_MS,
  DESTINATION,
  FIT_PADDING,
  MAX_LISTED_CITIES,
  PALETTE,
  RESUME_AFTER_IDLE_MS,
  RETURN_TRANSITION_MS,
  WORLD_BOUNDS,
} from '@/lib/config';
import { LONDON, type City } from '@/lib/cities';
import CityInput from './CityInput';

const DEST_POSITION: [number, number] = [DESTINATION.lng, DESTINATION.lat];

type ViewState = { longitude: number; latitude: number; zoom: number };

/**
 * What the camera is doing. Held in a ref rather than state: it changes on
 * interaction and on a timer, and nothing in the render tree depends on it.
 *
 * The globe build had a third 'spin' mode. A flat map has no equivalent -
 * drifting it sideways would just walk the routes off screen - so the map
 * simply rests at its default framing between arrivals.
 */
type CameraCommand =
  | { mode: 'rest' }
  | {
      mode: 'move';
      from: ViewState;
      to: ViewState;
      startedAt: number;
      durationMs: number;
      onArrive?: () => void;
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

  const [viewState, setViewStateInternal] = useState<ViewState>({
    longitude: -30,
    latitude: 25,
    zoom: 1,
  });
  const viewStateRef = useRef<ViewState>(viewState);
  const cameraRef = useRef<CameraCommand>({ mode: 'rest' });
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef({ width: 1000, height: 800 });

  const applyViewState = useCallback((next: ViewState) => {
    viewStateRef.current = next;
    setViewStateInternal(next);
  }, []);

  /** The full-world framing. The only framing this build ever uses. */
  const defaultView = useCallback((): ViewState => {
    const { width, height } = viewportRef.current;
    const fitted = new WebMercatorViewport({ width, height }).fitBounds(
      WORLD_BOUNDS,
      { padding: FIT_PADDING }
    );
    return {
      longitude: fitted.longitude,
      latitude: fitted.latitude,
      zoom: fitted.zoom,
    };
  }, []);

  // One animation loop drives every camera move, so nothing can fight over it.
  useEffect(() => {
    let frame = 0;

    const tick = (now: number) => {
      const command = cameraRef.current;

      if (command.mode === 'move') {
        const progress = Math.min(
          1,
          (now - command.startedAt) / command.durationMs
        );
        const eased = easeInOutCubic(progress);
        const { from, to } = command;

        applyViewState({
          longitude: from.longitude + (to.longitude - from.longitude) * eased,
          latitude: from.latitude + (to.latitude - from.latitude) * eased,
          zoom: from.zoom + (to.zoom - from.zoom) * eased,
        });

        if (progress >= 1) {
          cameraRef.current = { mode: 'rest' };
          command.onArrive?.();
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

  const moveTo = useCallback(
    (to: ViewState, durationMs: number, onArrive?: () => void) => {
      cameraRef.current = {
        mode: 'move',
        from: viewStateRef.current,
        to,
        startedAt: performance.now(),
        durationMs,
        onArrive,
      };
    },
    []
  );

  const returnToDefault = useCallback(
    () => moveTo(defaultView(), RETURN_TRANSITION_MS),
    [defaultView, moveTo]
  );

  const scheduleReturn = useCallback(
    (delayMs: number) => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(returnToDefault, delayMs);
    },
    [returnToDefault]
  );

  /** A visitor panned the map: leave it be, then hand it back when idle. */
  const takeManualControl = useCallback(() => {
    cameraRef.current = { mode: 'rest' };
    scheduleReturn(RESUME_AFTER_IDLE_MS);
  }, [scheduleReturn]);

  /** Reset control: re-centre on the event location at the default zoom. */
  const resetView = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    const { zoom } = defaultView();
    moveTo(
      { longitude: DESTINATION.lng, latitude: DESTINATION.lat, zoom },
      RETURN_TRANSITION_MS
    );
  }, [defaultView, moveTo]);

  // Track the viewport so framing adapts to whatever screen this is mirrored
  // onto, rather than assuming the size it was developed at.
  useEffect(() => {
    const measure = () => {
      viewportRef.current = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      if (cameraRef.current.mode === 'rest') applyViewState(defaultView());
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [applyViewState, defaultView]);

  /**
   * Draw the route straight away, with the camera left alone.
   *
   * The globe build swung round and zoomed onto each new route. Here the map
   * stays at the full-world framing throughout, so every arc animates in
   * against the accumulated web rather than pulling the view off it.
   */
  const handleSubmit = useCallback((city: City) => submit(city), [submit]);

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
      // Follow the actual flight path rather than a straight line on a
      // distorted projection - London to Chicago arcs up over Labrador.
      greatCircle: true,
      getSourcePosition: (d) => [d.lng, d.lat],
      getTargetPosition: () => DEST_POSITION,
      getSourceColor: PALETTE.arcSettled,
      getTargetColor: PALETTE.arcHot,
      getStartTime: (d) => d.animStart,
      // No getHeight: at pitch 0 an arc's altitude isn't visible, only its
      // great-circle ground track, so the default is fine here.
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
      {/* Wrapper catches taps on the map itself. Overlay siblings below are
          outside it, so using the input doesn't count as grabbing the map. */}
      <div className="absolute inset-0" onPointerDown={takeManualControl}>
        <DeckGL
          views={new MapView({ repeat: true })}
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
            Loading map
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
                  <span className="ml-2 text-xs text-amber-200/50">
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
    </div>
  );
}

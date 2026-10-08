/**
 * Single source of truth for the installation's look, geography and timing.
 * Kept in one file so the visual pass in a later phase doesn't require hunting
 * through layer code.
 *
 * This is the 2D variant: a flat Web Mercator map rather than a globe.
 */

/** Where every route converges. One fixed event location (PLAN.md Q6). */
export const DESTINATION = {
  cityKey: 'chicago-united-states',
  cityName: 'Chicago',
  country: 'United States',
  lat: 41.8781,
  lng: -87.6298,
} as const;

/** RGBA, 0-255, as deck.gl expects. */
export const PALETTE = {
  /** Backdrop, which on a flat map reads as the ocean. */
  background: [5, 9, 18] as [number, number, number],
  land: [31, 46, 73, 255] as [number, number, number, number],
  landBorder: [54, 76, 115, 255] as [number, number, number, number],

  /** Arc while it is drawing in. */
  arcHot: [255, 214, 130, 255] as [number, number, number, number],
  /** Arc once it has settled and joined the accumulated web. */
  arcSettled: [240, 180, 41, 170] as [number, number, number, number],

  origin: [255, 232, 180, 255] as [number, number, number, number],
  destination: [255, 255, 255, 255] as [number, number, number, number],
} as const;

/** Milliseconds for one arc to draw itself from origin to destination. */
export const ARC_DRAW_MS = 2600;

/** How long the camera takes to settle back to the default framing. */
export const RETURN_TRANSITION_MS = 1200;

/**
 * How long to wait after a visitor stops panning before the map eases back to
 * its default framing. An unattended installation left wherever the last
 * person dragged it is an installation nobody can read.
 */
export const RESUME_AFTER_IDLE_MS = 5000;

/**
 * How many submitted cities to name on screen before collapsing the rest into
 * a count.
 */
export const MAX_LISTED_CITIES = 12;

/**
 * Default framing. Latitude is clipped well short of the poles because
 * Mercator stretches them into uselessness and nobody is flying in from there.
 */
export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-170, -56],
  [178, 76],
];

/** Breathing room, in pixels, left around the default framing. */
export const FIT_PADDING = 80;

/**
 * Single source of truth for the installation's look, geography and timing.
 * Kept in one file so the visual pass in a later phase doesn't require hunting
 * through layer code.
 */

/** Where every route converges. One fixed event location (PLAN.md Q6). */
export const DESTINATION = {
  cityKey: 'chicago-united-states',
  cityName: 'Chicago',
  country: 'United States',
  lat: 41.8781,
  lng: -87.6298,
} as const;

/**
 * Accent used for routes and interactive chrome. Declared once here and as a
 * Tailwind arbitrary value in the components, so there is a single place to
 * change it.
 */
export const ACCENT_HEX = '#a4ebff';

/** RGBA, 0-255, as deck.gl expects. */
export const PALETTE = {
  /** Space behind the globe. */
  background: [3, 5, 10] as [number, number, number],
  /** The sphere itself, i.e. ocean. */
  ocean: [10, 20, 38, 255] as [number, number, number, number],
  land: [31, 46, 73, 255] as [number, number, number, number],
  landBorder: [54, 76, 115, 255] as [number, number, number, number],

  /** Arc while it is drawing in: the accent at full strength. */
  arcHot: [164, 235, 255, 255] as [number, number, number, number],
  /** Arc once it has settled and joined the accumulated web: same hue, receded. */
  arcSettled: [116, 185, 212, 170] as [number, number, number, number],

  origin: [214, 246, 255, 255] as [number, number, number, number],
  destination: [255, 255, 255, 255] as [number, number, number, number],
} as const;

/**
 * Arc apex height. On a globe this is a multiple of angular distance x earth
 * radius, i.e. metres of altitude - NOT the modest ratio it is on a flat map.
 * A value of 1 puts the apex a full earth radius into space, where the arc
 * sails off screen and only stubs near the endpoints remain visible.
 */
export const ARC_HEIGHT = 0.25;

/** Milliseconds for one arc to draw itself from origin to destination. */
export const ARC_DRAW_MS = 2600;

/**
 * Degrees of longitude per second for the idle rotation. A full revolution
 * takes about two minutes - visibly turning from across a room, still slow
 * enough not to pull focus from an arc drawing in.
 */
export const SPIN_DEGREES_PER_SECOND = 3;

/** How long the camera takes to swing round to a newly submitted route. */
export const FOCUS_TRANSITION_MS = 1800;

/** How long the focused route is held before the globe returns to its default. */
export const FOCUS_HOLD_MS = 1800;

/** How long the camera takes to settle back to the default framing. */
export const RETURN_TRANSITION_MS = 1200;

/**
 * How long to wait after a visitor stops dragging the globe before the idle
 * spin takes back over. The brief only asks that interaction stops the spin;
 * resuming matters because an unattended installation that stops spinning after
 * the first touch stays stopped for the rest of the event.
 */
export const RESUME_SPIN_AFTER_IDLE_MS = 5000;

/** The radius deck.gl's GlobeViewport projects longitude/latitude onto. */
export const EARTH_RADIUS_M = 6370972;

/**
 * Grid size, in degrees, that deck.gl cuts polygons into before projecting them
 * onto the globe. Finer means flatter triangles and a better-behaved fill, at
 * the cost of more one-time tessellation work on load.
 */
export const GLOBE_RESOLUTION_DEGREES = 5;

/**
 * Radius of the ocean sphere.
 *
 * Each grid cell of a cut polygon is rendered as a FLAT triangle, and the
 * middle of a flat chord sits below the sphere surface it spans. If the ocean
 * sphere is drawn at full radius it covers those sagging middles and every
 * country renders as a thin rim with a hole punched through it. So the sphere
 * is dropped just below the deepest sag a cell can have. Derived rather than
 * hard-coded so changing the resolution above can't silently reintroduce the
 * holes.
 */
const CELL_DIAGONAL_RAD = (GLOBE_RESOLUTION_DEGREES * Math.SQRT2 * Math.PI) / 180;
const MAX_CHORD_SAG_M = EARTH_RADIUS_M * (1 - Math.cos(CELL_DIAGONAL_RAD / 2));
export const SPHERE_RADIUS_M = EARTH_RADIUS_M - MAX_CHORD_SAG_M * 1.6;

/**
 * How many submitted cities to name on screen before collapsing the rest into
 * a count. A real event will accumulate far more than fit down one edge.
 */
export const MAX_LISTED_CITIES = 12;

/** Where the globe sits when nothing in particular is happening. */
export const IDLE_VIEW_STATE = {
  longitude: -30,
  latitude: 25,
  zoom: 1.9,
};

/**
 * Globe diameter as a fraction of the smaller viewport dimension. Expressed as
 * a fraction rather than a zoom level because the installation mirrors to a
 * screen whose size and aspect we don't control; a fixed zoom that frames well
 * on a laptop leaves the globe a dot on a 4K display.
 */
export const IDLE_GLOBE_FILL = 0.85;

/**
 * How tightly to frame a submitted route, interpolated by how far it travels.
 * A short hop can be framed close; a Tokyo-to-Chicago route needs the camera
 * pulled back or both endpoints end up on the limb of the globe where they're
 * barely readable.
 */
export const FOCUS_GLOBE_FILL_SHORT = 1.0;
export const FOCUS_GLOBE_FILL_LONG = 0.62;

/** deck.gl's GlobeView maps the full circumference to 512 * 2^zoom pixels. */
export function zoomForGlobeFill(viewportMin: number, fill: number): number {
  return Math.log2((viewportMin * fill * Math.PI) / 512);
}

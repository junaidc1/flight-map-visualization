/** Spherical helpers for aiming the globe camera. */

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export type LatLng = { lat: number; lng: number };

/** Fold any longitude back into [-180, 180). */
export function wrapLongitude(lng: number): number {
  return (((lng + 180) % 360) + 360) % 360 - 180;
}

/**
 * Signed shortest angular distance from one longitude to another, so a camera
 * move from +170 to -170 travels 20 degrees east rather than 340 west.
 */
export function shortestLongitudeDelta(from: number, to: number): number {
  return wrapLongitude(to - from);
}

/**
 * Midpoint of the great circle between two points. Averaging lat/lng directly
 * would land in the wrong place for long or high-latitude routes, so this
 * averages the 3D unit vectors instead.
 */
export function greatCircleMidpoint(a: LatLng, b: LatLng): LatLng {
  const lat1 = toRadians(a.lat);
  const lng1 = toRadians(a.lng);
  const lat2 = toRadians(b.lat);
  const lng2 = toRadians(b.lng);

  const x1 = Math.cos(lat1) * Math.cos(lng1);
  const y1 = Math.cos(lat1) * Math.sin(lng1);
  const z1 = Math.sin(lat1);
  const x2 = Math.cos(lat2) * Math.cos(lng2);
  const y2 = Math.cos(lat2) * Math.sin(lng2);
  const z2 = Math.sin(lat2);

  const x = (x1 + x2) / 2;
  const y = (y1 + y2) / 2;
  const z = (z1 + z2) / 2;

  return {
    lat: toDegrees(Math.atan2(z, Math.hypot(x, y))),
    lng: toDegrees(Math.atan2(y, x)),
  };
}

/**
 * Angle subtended at the earth's centre between two points, in radians.
 * 0 for the same place, PI for antipodes.
 */
export function angularDistance(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = Math.sin((lat2 - lat1) / 2);
  const dLng = Math.sin((toRadians(b.lng) - toRadians(a.lng)) / 2);
  const h = dLat * dLat + Math.cos(lat1) * Math.cos(lat2) * dLng * dLng;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}



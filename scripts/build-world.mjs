/**
 * Converts the world-atlas TopoJSON (an npm dep) into a GeoJSON asset served
 * from /public. Pre-converting keeps runtime cost at zero and means the display
 * needs no basemap service, no API token, and no network beyond our own origin.
 *
 * Run: npm run build:world
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);

// 110m is the coarsest Natural Earth tier: ~100KB of TopoJSON, and plenty of
// detail for a world map projected at wall scale.
const topoPath = require.resolve('world-atlas/countries-110m.json');
const topo = JSON.parse(readFileSync(topoPath, 'utf8'));

const geo = feature(topo, topo.objects.countries);

/**
 * Russia and Fiji straddle the antimeridian, so their rings contain a 360-degree
 * longitude jump. deck.gl tessellates such a ring into a band stretching the
 * full width of the map, which renders as a bright stripe across the ocean.
 *
 * The fix is to unwrap rather than clip: walk each ring and carry a +/-360
 * offset so consecutive longitudes never jump more than 180. The ring then
 * extends past +/-180 as a continuous shape, and MapView's `repeat` draws the
 * wrapped copy on the other edge.
 */
function unwrapRing(ring) {
  let offset = 0;
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    if (i > 0) {
      const delta = lng + offset - out[i - 1][0];
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    out.push([lng + offset, lat]);
  }
  // An even number of crossings returns the offset to zero, but re-close
  // explicitly so a stray odd crossing can't leave a ring open.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    out[out.length - 1] = [...out[0]];
  }
  return out;
}

function unwrapGeometry(geometry) {
  const polys =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const fixed = polys.map((poly) => poly.map(unwrapRing));
  return geometry.type === 'Polygon'
    ? { ...geometry, coordinates: fixed[0] }
    : { ...geometry, coordinates: fixed };
}

// Antarctica reads as a distracting white band across the bottom of the map and
// no attendee is flying in from there.
const before = geo.features.length;
geo.features = geo.features
  .filter((f) => f.properties?.name !== 'Antarctica')
  .map((f) => ({ ...f, geometry: unwrapGeometry(f.geometry) }));

// Verify the fix held rather than trusting it.
let remaining = 0;
for (const f of geo.features) {
  const polys =
    f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++)
        if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) remaining++;
}
if (remaining > 0) {
  throw new Error(`${remaining} antimeridian jumps survived unwrapping`);
}

const out = new URL('../public/world-countries-110m.geojson', import.meta.url);
writeFileSync(out, JSON.stringify(geo));

console.log(
  `wrote ${geo.features.length} features (dropped ${before - geo.features.length}) · ` +
    `0 antimeridian jumps · ${(statSync(out).size / 1024).toFixed(0)}KB`
);

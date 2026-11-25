# Flight Routes

Display app for a live flight-route projection installation: visitors enter the
city they travelled from, and an animated route draws itself across a slowly
rotating globe to the event location, accumulating into a web of arrivals.

**Scope:** the globe, the arc animation and the visitor input. No database, no
realtime sync yet — submissions live in browser memory for the length of the
session.

The full architecture and build phases live in a project plan kept outside this
repository; the `PLAN.md` references below point at it.

## Run it

```bash
npm install
npm run dev
```

Then open **http://localhost:3000/display** and type a city.

| URL | What it shows |
|---|---|
| `/display` | The installation: globe spins, visitor enters a city, route flies in |
| `/display?demo=1` | Flies London in by itself, for hands-free checking |
| `/display?hydrated=1` | London already settled — stands in for a mid-event display refresh |

## How it behaves

- The globe turns on its own, about two minutes per revolution.
- Dragging or clicking the globe stops the spin. After 5 seconds idle it eases
  back to the default framing and resumes, so the installation doesn't stay
  frozen after the first visitor touches it. (`RESUME_SPIN_AFTER_IDLE_MS` in
  `lib/config.ts`; the brief only asked that interaction stops the spin, so the
  resume is worth a look.)
- Double-click zoom is disabled — too easy to trigger by accident on a touch
  display, and it leaves the globe in a state nobody asked for.
- **Reset view** (top right) re-centres the globe on Chicago at the default
  zoom and resumes the spin, from wherever it has ended up. It takes the short
  way round rather than unwinding the long way home.
- Submitting a city swings the globe round to frame that route, draws the arc
  once the camera arrives, holds briefly, then eases back to the default.
- A repeat submission from a city already on the globe replays that arc rather
  than stacking a second one on top of it.
- The counter shows unique cities only, with the submitted cities named
  underneath it. The list caps at `MAX_LISTED_CITIES` (12) and collapses the
  rest into a "+N more" line, since a real event will accumulate far more than
  fit down one edge. A city submitted more than once shows a ×N count.
- Globe framing is set by `IDLE_GLOBE_FILL` (0.85 of the smaller viewport
  dimension). Focus framing interpolates between `FOCUS_GLOBE_FILL_SHORT` and
  `..._LONG` by route length, so a short hop zooms in and a long haul pulls
  back rather than pushing its endpoints onto the limb.

## Build steps

1. **Scaffold** — Next.js 16 + React 19 + Tailwind 4, deck.gl 9.4.
2. **World map** — GeoJSON pre-built from the `world-atlas` npm package. No
   basemap service, no API token, no tiles.
3. **Static arc** — great-circle London → Chicago.
4. **Animated arc** — `lib/AnimatedArcLayer.ts`, the draw-in animation.
5. **Replay + hydration** — `lib/useOriginScene.ts`.
6. **Globe + input** — `_GlobeView`, camera choreography, `CityInput`.

## Things that will bite you if you forget them

**deck.gl's ArcLayer has no draw-in animation.** `AnimatedArcLayer` adds one by
giving each arc a per-instance `startTime` attribute and discarding fragments
ahead of a travelling tip in the fragment shader. All arcs live in one layer and
one draw call, so a thousand routes cost about what one costs. The same
mechanism covers new submissions, hydrated backlog (start time in the past, so
it renders complete on the first frame) and repeat-city replay.

**The shader clock runs in seconds since page load, not epoch ms.** Epoch
milliseconds are ~1.79e12, past the 2^24 range where a float32 uniform holds
integers exactly — passing one quantises the clock into roughly four-minute
steps and the animation never moves.

**GlobeView culls back faces, which makes arcs vanish entirely.** An arc is a
triangle strip whose winding depends on which way it travels, so under the
globe's culling it doesn't degrade — it disappears, with no error and no
warning. `AnimatedArcLayer` sets `parameters: { cullMode: 'none' }` in its
defaults. Depth testing still gives the globe its occlusion, so arcs on the far
side stay hidden.

**`getHeight` means something different on a globe.** On a flat map it's a
modest ratio; on a globe it multiplies `angularDistance × EARTH_RADIUS`, in
metres. A value of 1 puts the arc's apex a full earth radius into space.
`ARC_HEIGHT` is 0.25.

**The ocean sphere's radius is derived, not chosen.** deck.gl cuts polygons
into a grid (`GLOBE_RESOLUTION_DEGREES`) and renders each cell as a *flat*
triangle. The middle of a flat chord sits below the sphere surface it spans, so
a full-radius ocean sphere covers those sagging middles and every country
renders as a thin rim with a hole punched through its interior. `config.ts`
computes the worst-case sag for the chosen grid size and drops the sphere just
below it — about 0.3% of the radius, invisible at the limb. Change the
resolution and the radius follows, so the holes can't come back silently.

**Globe size is computed, not hard-coded.** The installation mirrors to a screen
whose size we don't control, so `zoomForGlobeFill` derives the zoom from the
viewport. A fixed zoom that frames well on a laptop leaves the globe a dot on a
4K display.

## Accent colour

`ACCENT_HEX` in `lib/config.ts` (`#a4ebff`) is the single place the accent is
named. The deck.gl layers take it as the RGBA entries beside it in `PALETTE`
(`arcHot`, `arcSettled`, `origin`); the DOM chrome uses it as a Tailwind
arbitrary value, `[#a4ebff]`, so changing it means touching those two places
rather than hunting through components.

## Layout

```
app/display/page.tsx          client-only mount (deck.gl needs WebGL)
app/display/DisplayCanvas.tsx globe, layers, camera choreography
app/display/CityInput.tsx     visitor entry panel
lib/AnimatedArcLayer.ts       ArcLayer subclass with the draw-in animation
lib/useOriginScene.ts         what the globe is showing; submit + hydrate
lib/geo.ts                    great-circle midpoint, longitude wrapping, easing
lib/config.ts                 palette, destination, timings, framing
lib/cities.ts                 placeholder city list + search
scripts/build-world.mjs       TopoJSON -> GeoJSON, runs automatically on build
```

`scripts/build-world.mjs` also unwraps Russia and Fiji, whose rings contain a
360° longitude jump across the antimeridian. Left alone, deck.gl tessellates
those into bright bands stretching the full width of the map.

## Known placeholders

- **City list** — `lib/cities.ts` holds ~75 major cities so the input is real
  and testable. Phase 2 replaces it with GeoNames cities15000 (~26k cities,
  CC-BY 4.0) bundled into the kiosk, per PLAN.md 1.4. The shape already matches.
- **Input lives on the display page.** `CityInput` is self-contained so it can
  move to a `/kiosk` route unchanged once there are real kiosk devices.
- **No persistence.** Reload and the globe is empty. That's Phase 1.

## Next

Phase 1 of the project plan: Supabase schema, `POST /api/origins`, hydration
endpoint, realtime subscription. `hydrate()` on load plus `submit()` per
realtime event — both already exist and are exercised by the flags above.

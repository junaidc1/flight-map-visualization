# Flight Routes — 2D variant

Display app for a live flight-route projection installation: visitors enter the
city they travelled from, and an animated route draws itself across a world map
to the event location, accumulating into a web of arrivals.

**This is the 2D variant.** It renders a flat Web Mercator map, and the camera
stays on the full-world framing throughout. A sibling build renders the same
installation as a rotating globe that swings round to each new route.

The full architecture and build phases live in a project plan kept outside this
repository; the `PLAN.md` references below point at it.

**Scope:** the map, the arc animation and the visitor input. No database, no
realtime sync yet — submissions live in browser memory for the length of the
session.

## Run it

```bash
npm install
npm run dev -- -p 3001
```

Then open **http://localhost:3001/display**. Port 3001 keeps it clear of the
globe build on 3000 so both can run side by side.

| URL | What it shows |
|---|---|
| `/display` | The installation: visitor enters London, route flies in |
| `/display?demo=1` | Flies London in by itself, for hands-free checking |
| `/display?hydrated=1` | London already settled — stands in for a mid-event display refresh |

## How it behaves

- The map rests at a default world framing. **There is no idle animation**: the
  globe build's slow spin has no sensible flat-map equivalent, since drifting a
  Mercator map sideways just walks the routes off screen.
- Submitting a city draws its arc straight away, **with the camera left where
  it is**. The map stays at the full-world framing throughout, so each new arc
  animates in against the accumulated web rather than pulling the view off it.
  (The globe build does swing round and zoom onto each new route.)
- Panning or zooming leaves the map alone, then eases back to the default after
  5 seconds idle — an installation left wherever the last visitor dragged it is
  one nobody can read.
- Double-click zoom is disabled — too easy to trigger by accident on a touch
  display.
- **Reset view** (top right) re-centres on Chicago at the default zoom.
- The counter shows unique cities, with the submitted cities named underneath.
  A city submitted more than once shows a ×N count.

## Input

Selection-only: visitors pick from the dataset and never submit free text, so no
attendee-authored string can reach the screen.

`lib/cities.ts` holds ~75 major cities so the input is real and testable. Phase
2 replaces it with GeoNames cities15000 (~26k cities, CC-BY 4.0), per PLAN.md
1.4. The shape already matches.

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

**`getHeight` is deliberately unset on the arc layer.** At pitch 0 an arc's
altitude isn't visible, only its great-circle ground track, so it would do
nothing here. It matters a great deal on a globe — see the other build.

## Layout

```
app/display/page.tsx          client-only mount (deck.gl needs WebGL)
app/display/DisplayCanvas.tsx map, layers, camera moves
app/display/CityInput.tsx     visitor entry panel
lib/AnimatedArcLayer.ts       ArcLayer subclass with the draw-in animation
lib/useOriginScene.ts         what the map is showing; submit + hydrate
lib/geo.ts                    great-circle and longitude helpers, easing
lib/config.ts                 palette, destination, timings, framing
lib/cities.ts                 placeholder city list + search
scripts/build-world.mjs       TopoJSON -> GeoJSON, runs automatically on build
```

`scripts/build-world.mjs` also unwraps Russia and Fiji, whose rings contain a
360° longitude jump across the antimeridian. Left alone, deck.gl tessellates
those into bright bands stretching the full width of the map.

## Known placeholders

- **No persistence.** Reload and the map is empty. That's Phase 1 in the plan.
- **Input lives on the display page.** `CityInput` is self-contained so it can
  move to a `/kiosk` route unchanged.

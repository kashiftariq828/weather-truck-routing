# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver pick the **safest route** using the
**forecast weather at the time the truck will actually reach each part of the trip**,
the **load weight**, and **travel time**.

**Live app:** https://weather-truck-routing-production-175e.up.railway.app · **Walkthrough:** https://www.loom.com/share/e8228cad6c5042eda6b3ada2dd57b91f

---

## What it does

1. Click **Find routes** and enter origin, destination, departure time, load weight (lb) and a checkpoint interval (10 / 25 / 50 mi).
2. The app fetches **3 truck routes**, places a checkpoint every N miles, and estimates the **ETA** at each one.
3. For each checkpoint it looks up the **hourly forecast for that place at that ETA** (wind, rain, snow).
4. Each checkpoint is rated **Low → Moderate → High → Severe → No Travel** using the spec's thresholds and load rules.
5. Routes are ranked, the **safest is recommended** with a one-line reason, and everything is drawn on the map.
6. A **weather heatmap** covers the corridor around the routes, with a **0–48 h forecast slider** and play button.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS, TanStack Query | Required React; typed, fast builds |
| Map | MapLibre GL JS (via `react-map-gl`) + OpenFreeMap tiles | WebGL rendering with a native heatmap layer; free, no key |
| Backend | Django 5.2 LTS + Django REST Framework | Required Django; serializers validate input |
| Routing & search | [TomTom](https://developer.tomtom.com) Routing + Search APIs | `travelMode=truck` with gross vehicle weight, traffic-aware times for the departure time, up to 5 alternatives at any distance, per-point travel times for accurate ETAs; free (2,500 req/day, no card) |
| Weather | [Open-Meteo](https://open-meteo.com) hourly forecast | Free, no key, returns mph and inches, many locations per request |
| Hosting | Railway (Docker), single service | Django serves the API **and** the built React app → one URL, no CORS |

Everything runs on free tiers.

## Architecture

```
React (Vite)  ──/api──►  Django REST API
  MapLibre map             ├── clients/   TomTom (routes, search) · Open-Meteo (weather)   ← HTTP + caching only
  heatmap + slider         ├── domain/    checkpoints · risk · recommend · heatmap      ← pure functions, unit-tested
  route cards              └── services.py  plan_trip(): ties clients + domain together
```

```
backend/planner/
  domain/risk.py          thresholds + load rules → level + human-readable reason
  domain/checkpoints.py   checkpoints every N miles, ETA from router step durations
  domain/recommend.py     checkpoint levels → miles per level → ranking + reason
  domain/alternatives.py  via-point detours when the router returns < 3 routes
  domain/heatmap.py       corridor sample grid (bounded size)
  domain/geometry.py      haversine, interpolation, overlap, line simplification
  clients/tomtom.py       TomTom truck routing + address search
  clients/open_meteo.py   batched, parallel, always-live hourly forecasts
frontend/src/
  components/MapView.tsx  routes, checkpoints, popups, heatmap layer
  components/ForecastSlider.tsx, RouteCards.tsx, TripForm.tsx, PlaceInput.tsx, Legend.tsx
  lib/geo.ts              GeoJSON builders, heatmap sizing
```

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/geocode?q=` | Address autocomplete via TomTom Search (proxied so the API key stays server-side) |
| `POST /api/plan` | `{origin, destination, departure, load_lb, interval_mi}` → 3 routes with checkpoints, risk, stats, recommendation |
| `GET /api/plan/<id>/heatmap` | Corridor points × 49 hourly risk levels (hours 0–48 from departure) |

The heatmap is a separate request so routes appear immediately and the heatmap fills in a moment later.

## Core logic

### 1. Three routes
TomTom is asked for the fastest **truck** route plus 2 alternatives, with:
- `vehicleWeight` = gross weight = cargo (user input) + ~33,000 lb tractor-trailer tare, so weight-restricted roads are avoided
- `departAt` = the departure time, so historic and live traffic shape the route and its travel time

If fewer than 3 routes come back, the app routes **origin → via point → destination**, with the via point
beside the main route's midpoint (offset 12 %, 20 %, 30 % of trip length, alternating sides). Candidates that
overlap an existing route by more than 85 % are rejected. These routes are labelled **Detour**.

_Why TomTom and not OpenRouteService:_ ORS was the first choice, but its public API refuses alternative
routes beyond 100 km and has no traffic data. Every real truck trip fell back to detours, and congested
roads (e.g. GT Road vs the M-2 motorway in Pakistan) were rated as fast as motorways.

### 2. Checkpoints & ETAs
Checkpoints are placed every N miles along the route geometry (haversine distance), plus start and destination.
**ETA = departure + driving time to that point**, where driving time comes from TomTom's cumulative
travel-time markers along the route (`extendedRouteRepresentation=travelTime`), interpolated by distance
between markers. A slow city street and a fast interstate get realistic timing,
which is more accurate than assuming a constant speed.

### 3. Weather at the ETA
Checkpoints are snapped to a ~1 km grid, de-duplicated, and fetched from Open-Meteo in parallel batches of 100,
covering only the hours from departure to the last ETA. **Forecasts are never cached**: every plan and every heatmap
fetches live data, so results always reflect the latest model run. For each checkpoint:
- **wind** = sustained 10 m wind speed at the nearest hour (mph). Gusts are shown but not scored.
- **rain** = `rain + showers` totals for the hour containing the ETA (in/hr)
- **snow** = `snowfall` total for the hour containing the ETA (in/hr)

Open-Meteo's precipitation values are totals for the *preceding* hour, so the hour containing the ETA is the
one labelled with the next full hour. This is unit-tested.

### 4. Risk rules

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind | < 25 mph | 25–34 | 35–44 | 45–54 | ≥ 55 |
| Rain | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow | < 0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 |

Load rules (applied to wind): ≥ 55 mph → No Travel for any load · 45–54 mph + > 30,000 lb → No Travel ·
35–44 mph + > 40,000 lb → Severe.

**Checkpoint level = worst of wind (after load rules), rain and snow.** The cause is shown in the popup, e.g.
_"Wind 47 mph with 38,000 lb load → No Travel"_. Values are shown at the forecast's own precision (0.1 mph,
0.001 in), so a displayed number never sits on the wrong side of a threshold (44.6 mph is not shown as "45 mph → High").

### 5. Recommendation
Each stretch between two checkpoints takes the **worse** of its two endpoint levels. Per route we total
miles at each level and the **mile-weighted average risk** (levels 0–4). Routes are ranked by:

1. No-Travel miles _(added, see assumptions)_
2. **Fewest Severe miles**
3. **Fewest High miles**
4. **Lowest average risk**
5. **Shortest travel time**

Miles are compared at 0.1 mi precision so float noise can't decide the result. The winning card shows why,
e.g. _"Fewest Severe miles: 0.0 vs 42.3"_.

### 6. Corridor heatmap
A grid of points along every route, at offsets of 0, ±15 and ±30 mi, snapped and de-duplicated. Spacing
grows on long trips to keep the grid at ≤ 220 points. Each point gets a risk level for every hour 0–48 using
the **same rules and load weight**, so the heatmap and checkpoint colors always agree.

## Assumptions & decisions

| Open point in the spec | Decision |
|---|---|
| "every 10 / 25 / 50 miles" | User-selectable; all three supported |
| Shared range boundaries (e.g. rain 0.25) | Assigned to the **higher** level (safety first); "> 1.00" and "> 3.0" applied exactly as written |
| Combining wind / rain / snow | Worst of the three |
| Load rules | Apply to wind only, as written |
| No Travel in the ranking | Not in the spec's list; added as the first key so a No-Travel route is never recommended over one without. Such routes are flagged **Not advised**. If every route has No-Travel miles, a banner suggests delaying departure |
| Miles from point samples | Stretch between checkpoints takes the worse endpoint (conservative) |
| "Average risk" | Mile-weighted mean of levels 0–4 over miles with a forecast |
| Slider hour 0 | The departure time (label shows the real date/time) |
| ETA beyond forecast range | Shown as **No forecast** (grey), never guessed. Departures are limited to the next 7 days |
| Fewer than 3 routes from the router | Via-point detours (above) |
| Time zones | Computed in UTC; displayed in the viewer's local time zone with its abbreviation |
| Unroutable trips (point in the sea, another continent) | `422` with a plain message, not a raw engine error; upstream outages are `502` |

## Performance notes (map & heatmap)

- **WebGL everywhere**: routes, checkpoints and the heatmap are MapLibre layers, not DOM elements.
- **Slider doesn't re-render React**: all 49 hours are loaded once as properties `r0…r48` on each heatmap
  point. Moving the slider calls `map.setPaintProperty('heatmap', 'heatmap-weight', ['get', 'r{h}'])`
  directly, so no data is re-uploaded and the map, routes and cards don't re-render.
- **Selection is a paint expression**: highlighting a route changes `['==', ['get','routeId'], id]` in
  paint properties; route GeoJSON is built once per plan.
- **Stable heatmap colors at any zoom**: the heatmap radius is computed from the grid spacing in miles and
  grows ×2 per zoom level, so density (and therefore color) stays steady while zooming.
- **Small payloads**: route geometry is split per risk level, merged, and simplified (Douglas-Peucker). A
  ~520 mi plan with 3 routes is ~65 KB.
- **Fast first paint**: routes arrive first (~3 s), the heatmap a moment later (~1 s).

## Run locally

Requirements: Python 3.12+, Node 20.19+ (or 22.12+), a free [TomTom API key](https://developer.tomtom.com) with the **Routing** and **Search** APIs enabled.

```bash
# Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # paste your TOMTOM_API_KEY
python manage.py runserver    # http://127.0.0.1:8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api to Django)
```

No database or migrations are needed. The app only uses a file-based cache.

## Tests & linting

```bash
cd backend  && pytest && ruff check . && ruff format --check .
cd frontend && npm test && npm run lint && npm run build
```

Backend tests cover every threshold boundary, every load rule at its edge (e.g. 47 mph at 30,000 vs
30,001 lb), worst-of-three combination, ETA timing from step durations, checkpoint spacing, mileage
totals, every ranking tie-breaker, forecast-hour lookup, search labels, request validation, and full API
runs with TomTom and Open-Meteo mocked (`respx`), both with native alternatives and with the detour fallback.

## Deploy

The app ships as one Docker image (`Dockerfile`), so any Docker host works. It listens on `$PORT` (default 8000).

**Railway** (used for the live app):

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → select the repo. The `Dockerfile` is detected automatically.
3. Set these service variables:
   - `TOMTOM_API_KEY`: your TomTom key
   - `DJANGO_SECRET_KEY`: any long random string
   - `DEBUG`: `false`
   - `ALLOWED_HOSTS`: `.up.railway.app,healthcheck.railway.app` (Railway's health checker sends `Host: healthcheck.railway.app`)
4. **Settings → Networking → Generate Domain**. Set the health check path to `/api/geocode`.

**Render**: `render.yaml` is included. Use **New → Blueprint**, set `TOMTOM_API_KEY`, and the secret key is
generated automatically.

## Known limitations

- Open-Meteo's free tier is for non-commercial use and counts each location as a call (600/min, 10,000/day).
  Because forecasts are always fetched live, every plan uses roughly 150–350 location-calls (checkpoints +
  heatmap), so about 25–60 plans a day, and 1–3 per minute, fit. Hitting the limit shows "Weather service rate
  limit reached — please try again in a minute". A production deployment would need their paid plan.
- TomTom's free tier allows 2,500 requests/day. A plan normally uses 1 routing request (more only if detours are needed), and searches are cached for 24 h.
- Route quality depends on TomTom's map and traffic coverage. It's strong in the US. In some regions (e.g. Pakistan) TomTom has little traffic data, so a congested road can still be estimated as fastest, though the alternatives (e.g. the M-2) are still offered and compared.
- Road names in the route cards come from TomTom's guidance data and may be empty where it has none.
- Wind risk uses sustained wind. Gusts are displayed but not scored, since the spec's thresholds don't say which to use.
- Forecast resolution is that of Open-Meteo's best model for the area (≈ 3–11 km).

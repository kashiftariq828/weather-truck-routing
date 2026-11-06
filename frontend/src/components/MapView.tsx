import { useEffect, useMemo, useState, type RefObject } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type { ExpressionSpecification, HeatmapLayerSpecification } from 'maplibre-gl'
import type { Heatmap, Plan } from '../api'
import { formatAmount, formatMiles, formatTime } from '../lib/format'
import {
  checkpointsGeoJSON,
  heatmapGeoJSON,
  heatRadiusAtZoom0,
  heatWeight,
  planBounds,
  routesGeoJSON,
} from '../lib/geo'
import { LEVEL_COLOR_EXPRESSION } from '../lib/risk'
import { BRAND } from '../lib/theme'
import { RiskBadge } from './RiskBadge'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const INITIAL_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.6 }
const LEVEL_COLOR = LEVEL_COLOR_EXPRESSION as ExpressionSpecification

/** A checkpoint to fly to and open; `key` changes on every request so the same point can be re-focused. */
export interface MapFocus {
  routeId: number
  idx: number
  key: number
}

interface Props {
  mapRef: RefObject<MapRef | null>
  plan: Plan | null
  heatmap: Heatmap | null
  selectedId: number
  onSelectRoute: (id: number) => void
  focus: MapFocus | null
}

export function MapView({ mapRef, plan, heatmap, selectedId, onSelectRoute, focus }: Props) {
  const [popup, setPopup] = useState<{ routeId: number; idx: number } | null>(null)
  const [cursor, setCursor] = useState('')

  const routes = useMemo(() => (plan ? routesGeoJSON(plan) : null), [plan])
  const checkpoints = useMemo(() => (plan ? checkpointsGeoJSON(plan) : null), [plan])
  const heat = useMemo(() => (heatmap ? heatmapGeoJSON(heatmap) : null), [heatmap])
  const endpoints = useMemo(() => {
    const cps = plan?.routes[0]?.checkpoints
    return cps?.length ? { start: cps[0], end: cps[cps.length - 1] } : null
  }, [plan])

  // Static per heatmap: the slider updates `heatmap-weight` imperatively.
  const heatPaint = useMemo((): HeatmapLayerSpecification['paint'] | null => {
    if (!heatmap || !plan) return null
    const b = planBounds(plan)
    const r0 = heatRadiusAtZoom0(heatmap.spacing_mi, (b[0][1] + b[1][1]) / 2)
    return {
      'heatmap-weight': heatWeight(0),
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, r0, 14, r0 * 2 ** 14],
      'heatmap-intensity': 1.1,
      'heatmap-opacity': 0.75,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(0,0,0,0)',
        0.12,
        'rgba(227,181,5,0)',
        0.25,
        'rgba(227,181,5,0.6)',
        0.5,
        'rgba(240,124,30,0.7)',
        0.75,
        'rgba(214,49,47,0.75)',
        1,
        'rgba(109,31,128,0.8)',
      ],
    }
  }, [heatmap, plan])

  useEffect(() => {
    setPopup(null)
    if (!plan || !mapRef.current) return
    mapRef.current.fitBounds(planBounds(plan), {
      padding: { top: 60, bottom: 140, left: 60, right: 60 },
      duration: 800,
    })
  }, [plan, mapRef])

  useEffect(() => {
    const cp = focus && plan?.routes[focus.routeId]?.checkpoints[focus.idx]
    const map = mapRef.current
    if (!focus || !cp || !map) return
    setPopup({ routeId: focus.routeId, idx: focus.idx })
    map.flyTo({ center: [cp.lon, cp.lat], zoom: Math.max(map.getZoom(), 8), duration: 1200 })
  }, [focus, plan, mapRef])

  const isSelected: ExpressionSpecification = ['==', ['get', 'routeId'], selectedId]

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (!f) return setPopup(null)
    const { routeId, idx } = f.properties as { routeId: number; idx?: number }
    if (f.layer.id === 'checkpoints' && idx !== undefined) {
      setPopup({ routeId, idx })
      onSelectRoute(routeId)
    } else {
      setPopup(null)
      onSelectRoute(routeId)
    }
  }

  const popupRoute = popup ? plan?.routes[popup.routeId] : undefined
  const popupCp = popup ? popupRoute?.checkpoints[popup.idx] : undefined

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapStyle={MAP_STYLE}
      interactiveLayerIds={plan ? ['checkpoints', 'routes-line'] : []}
      onClick={onClick}
      onMouseEnter={() => setCursor('pointer')}
      onMouseLeave={() => setCursor('')}
      cursor={cursor}
      style={{ width: '100%', height: '100%' }}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <ScaleControl position="bottom-right" unit="imperial" />

      {routes && (
        <Source id="routes" type="geojson" data={routes}>
          <Layer
            id="routes-casing"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', isSelected, 1, 0] }}
            paint={{
              'line-color': '#ffffff',
              'line-width': ['case', isSelected, 9, 5],
              'line-opacity': ['case', isSelected, 1, 0.6],
            }}
          />
          <Layer
            id="routes-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', isSelected, 1, 0] }}
            paint={{
              'line-color': LEVEL_COLOR,
              'line-width': ['case', isSelected, 5.5, 3],
              'line-opacity': ['case', isSelected, 1, 0.45],
            }}
          />
        </Source>
      )}

      {heat && heatPaint && (
        <Source id="heat" type="geojson" data={heat}>
          <Layer id="heatmap" type="heatmap" paint={heatPaint} beforeId="routes-casing" />
        </Source>
      )}

      {checkpoints && (
        <Source id="checkpoints" type="geojson" data={checkpoints}>
          <Layer
            id="checkpoints"
            type="circle"
            layout={{ 'circle-sort-key': ['case', isSelected, 1, 0] }}
            paint={{
              'circle-color': LEVEL_COLOR,
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                4,
                ['case', isSelected, 4, 2.5],
                9,
                ['case', isSelected, 8, 5],
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': ['case', isSelected, 1.5, 1],
              'circle-opacity': ['case', isSelected, 1, 0.55],
              'circle-stroke-opacity': ['case', isSelected, 1, 0.55],
            }}
          />
        </Source>
      )}

      {endpoints && (
        <>
          <Marker longitude={endpoints.start.lon} latitude={endpoints.start.lat} anchor="center">
            <div
              title="Origin"
              className="marker-pulse relative h-4 w-4 rounded-full border-[3px] border-white bg-brand-light shadow-md"
            />
          </Marker>
          <Marker longitude={endpoints.end.lon} latitude={endpoints.end.lat} anchor="bottom">
            <svg width="28" height="36" viewBox="0 0 28 36" className="drop-shadow-md" aria-label="Destination">
              <path
                d="M14 35s12-11.6 12-21A12 12 0 0 0 2 14c0 9.4 12 21 12 21z"
                stroke="#fff"
                strokeWidth="2"
                style={{ fill: BRAND.base }}
              />
              <circle cx="14" cy="14" r="4.5" style={{ fill: BRAND.accent }} />
            </svg>
          </Marker>
        </>
      )}

      {popupRoute && popupCp && (
        <Popup
          longitude={popupCp.lon}
          latitude={popupCp.lat}
          onClose={() => setPopup(null)}
          closeOnClick={false}
          maxWidth="260px"
        >
          <div className="text-xs text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-slate-900">{popupRoute.name}</strong>
              <RiskBadge level={popupCp.level} />
            </div>
            <div className="mt-1 text-slate-700">
              Mile {popupCp.mile.toFixed(0)} of {formatMiles(popupRoute.distance_mi)}
            </div>
            <div className="mt-1">
              <span className="text-slate-700">ETA </span>
              <strong>{formatTime(popupCp.eta)}</strong>
            </div>
            <p className="mt-1 font-medium">{popupCp.reason}</p>
            {popupCp.weather && (
              <table className="mt-1.5 w-full">
                <tbody>
                  <tr>
                    <td className="text-slate-700">Wind</td>
                    <td className="text-right">
                      {formatAmount(popupCp.weather.wind_mph, 1)} mph
                      {popupCp.weather.gust_mph !== null && (
                        <span className="text-slate-600"> (gusts {formatAmount(popupCp.weather.gust_mph, 1)})</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-slate-700">Rain</td>
                    <td className="text-right">{formatAmount(popupCp.weather.rain_in_hr, 3, 2)} in/hr</td>
                  </tr>
                  <tr>
                    <td className="text-slate-700">Snow</td>
                    <td className="text-right">{formatAmount(popupCp.weather.snow_in_hr, 3, 2)} in/hr</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </Popup>
      )}
    </Map>
  )
}

import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { fetchHeatmap, planTrip, type Plan, type PlanRequest } from './api'
import { HeatmapPanel } from './components/HeatmapPanel'
import { Landing } from './components/Landing'
import { Legend } from './components/Legend'
import { Logo } from './components/Logo'
import { MapView, type MapFocus } from './components/MapView'
import { Modal } from './components/Modal'
import { PlanError } from './components/PlanError'
import { RouteCards } from './components/RouteCards'
import { RouteSkeletons } from './components/RouteSkeletons'
import { TripBar, type Trip } from './components/TripBar'
import { TripForm } from './components/TripForm'
import { TripSummary } from './components/TripSummary'
import { TruckLoader } from './components/TruckLoader'
import { heatWeight } from './lib/geo'
import type { Hazard } from './lib/trip'

/**
 * Two screens: the landing page, then (once a trip is submitted) the planner with
 * the map and results sidebar. The trip form lives in a modal over either one.
 */
export default function App() {
  const mapRef = useRef<MapRef>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [selectedId, setSelectedId] = useState(0)
  const [focus, setFocus] = useState<MapFocus | null>(null)

  const planMutation = useMutation({
    mutationFn: (req: PlanRequest) => planTrip(req),
    onSuccess: (p) => {
      setPlan(p)
      setSelectedId(p.recommended_id)
      setFocus(null)
    },
    // Don't leave the previous trip's routes on screen under an error for the new one.
    onError: () => setPlan(null),
  })

  const heatmapQuery = useQuery({
    queryKey: ['heatmap', plan?.plan_id],
    queryFn: () => fetchHeatmap(plan!.plan_id),
    enabled: !!plan,
  })

  const openForm = useCallback(() => setFormOpen(true), [])
  const closeForm = useCallback(() => setFormOpen(false), [])

  const submit = (t: Trip) => {
    setTrip(t)
    setFormOpen(false)
    planMutation.mutate(t.req)
  }

  const goHome = () => {
    setTrip(null)
    setPlan(null)
    planMutation.reset()
  }

  const focusHazard = useCallback((h: Hazard) => {
    setSelectedId(h.routeId)
    setFocus({ routeId: h.routeId, idx: h.peakIdx, key: Date.now() })
  }, [])

  // The slider talks to the map directly: one paint-property update per tick,
  // no React re-render of the map, routes or cards.
  const onHourChange = useCallback((hour: number) => {
    const map = mapRef.current?.getMap()
    if (map?.getLayer('heatmap')) map.setPaintProperty('heatmap', 'heatmap-weight', heatWeight(hour))
  }, [])

  const showResults = plan && !planMutation.isPending

  return (
    <>
      {trip ? (
        <div className="flex h-full flex-col md:flex-row">
          <aside className="order-2 flex w-full flex-col bg-slate-50 md:order-1 md:h-full md:w-[420px] md:shrink-0 md:border-r md:border-slate-200">
            <header className="border-b border-slate-200 bg-white px-5 pt-4 pb-5 text-slate-950">
              <button type="button" onClick={goHome} className="text-left" title="Back to start">
                <Logo />
              </button>
              <TripBar trip={trip} onEdit={openForm} />
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {planMutation.isError && (
                <PlanError
                  message={planMutation.error.message}
                  onEdit={openForm}
                  onDismiss={() => planMutation.reset()}
                />
              )}
              {planMutation.isPending && <RouteSkeletons />}
              {showResults && (
                <>
                  <TripSummary plan={plan} selectedId={selectedId} onFocusHazard={focusHazard} />
                  <section aria-label="Route options">
                    <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
                      {plan.routes.length} route options · ranked safest first
                    </h2>
                    <RouteCards plan={plan} selectedId={selectedId} onSelect={setSelectedId} />
                  </section>
                </>
              )}
            </div>
          </aside>

          <main className="relative order-1 h-[55vh] min-h-[320px] flex-1 md:order-2 md:h-full">
            <MapView
              mapRef={mapRef}
              plan={plan}
              heatmap={heatmapQuery.data ?? null}
              selectedId={selectedId}
              onSelectRoute={setSelectedId}
              focus={focus}
            />
            <div className="pointer-events-none absolute top-3 left-3 hidden sm:block">
              <div className="pointer-events-auto">
                <Legend />
              </div>
            </div>
            {planMutation.isPending && <TruckLoader />}
            {showResults && (
              <div className="absolute right-3 bottom-8 left-3 mx-auto max-w-xl">
                {/* Keyed by plan so the slider starts at hour 0 for every new plan. */}
                <HeatmapPanel
                  key={plan.plan_id}
                  heatmap={heatmapQuery.data}
                  error={heatmapQuery.error}
                  onHourChange={onHourChange}
                />
              </div>
            )}
          </main>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <Landing onStart={openForm} paused={formOpen} />
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={closeForm}
        title="Plan your trip"
        subtitle="Where you're going, when you leave, and what you're hauling."
      >
        <TripForm onSubmit={submit} loading={planMutation.isPending} />
      </Modal>
    </>
  )
}

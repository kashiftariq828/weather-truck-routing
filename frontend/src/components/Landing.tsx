import type { CSSProperties } from 'react'
import { HeroIllustration } from './HeroIllustration'
import { CloudRainIcon, RouteIcon, ShieldIcon, TruckIcon } from './Icons'
import { Logo } from './Logo'
import { RoadBackground } from './RoadBackground'

const FEATURES = [
  {
    icon: RouteIcon,
    title: 'Three truck routes',
    text: 'Truck-legal options for your load weight, with traffic expected at your departure time.',
  },
  {
    icon: CloudRainIcon,
    title: 'Weather at each ETA',
    text: 'Wind, rain and snow forecast for the moment your truck reaches every checkpoint.',
  },
  {
    icon: ShieldIcon,
    title: 'The safest pick, explained',
    text: 'Ranked by severe miles, high-risk miles, average risk, then drive time — in plain words.',
  },
]

interface Props {
  onStart: () => void
  /** Freeze the background animation, e.g. while the trip modal covers the page. */
  paused?: boolean
}

export function Landing({ onStart, paused = false }: Props) {
  return (
    <div
      className="landing relative flex min-h-full flex-col overflow-hidden text-slate-950"
      data-paused={paused || undefined}
    >
      <RoadBackground />
      {/* Soft glows behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 bottom-0 h-[460px] w-[460px] rounded-full bg-brand-light/10 blur-3xl"
      />

      <nav className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo size="lg" />
        <button
          type="button"
          onClick={onStart}
          className="hidden rounded-full border-2 border-accent px-5 py-2 text-sm font-bold text-accent transition hover:bg-accent hover:text-white sm:block"
        >
          Find routes
        </button>
      </nav>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pt-6 pb-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-10">
        <div>
          <span className="card-in inline-flex items-center gap-2 rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-bold text-brand-light ring-1 ring-red-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Forecast checked at every checkpoint ETA
          </span>
          <h1
            className="card-in mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl lg:text-[3.4rem]"
            style={{ '--i': 1 } as CSSProperties}
          >
            Pick the safest route <span className="text-accent">before the storm</span> picks you.
          </h1>
          <p
            className="card-in mt-5 max-w-xl text-lg font-medium text-slate-800 sm:text-xl"
            style={{ '--i': 2 } as CSSProperties}
          >
            Compare three truck routes by the wind, rain and snow your rig will actually meet — timed to when you get
            there, adjusted for your load.
          </p>
          <div className="card-in mt-8 flex flex-wrap items-center gap-4" style={{ '--i': 3 } as CSSProperties}>
            <button
              type="button"
              onClick={onStart}
              className="cta group flex items-center gap-2.5 rounded-2xl bg-accent px-8 py-4 text-lg font-extrabold text-white shadow-xl shadow-accent/25 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-accent/35 active:translate-y-0"
            >
              <TruckIcon size={20} className="transition-transform group-hover:translate-x-1" />
              Find routes
            </button>
            <span className="text-base font-semibold text-slate-700">Free · No sign-up · Results in seconds</span>
          </div>
        </div>

        <HeroIllustration />
      </main>

      {/* Open band the background road winds through, so no content covers it */}
      <div data-road-lane aria-hidden className="h-48 sm:h-56" />

      <section aria-label="How it works" className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-10 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <div
              key={title}
              className="card-in rounded-2xl border-t-4 border-accent bg-white p-6 shadow-lg ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl"
              style={{ '--i': i + 4 } as CSSProperties}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-accent">
                <Icon size={22} />
              </span>
              <h3 className="mt-3 text-lg font-extrabold text-brand-light">{title}</h3>
              <p className="mt-1 text-base leading-relaxed text-slate-800">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-600">
          Routing by TomTom · Weather by Open-Meteo · Map data © OpenStreetMap contributors
        </p>
      </section>
    </div>
  )
}

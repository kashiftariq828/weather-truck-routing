/** Placeholder shapes for the summary and route cards while a plan loads. */
export function RouteSkeletons() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2.5 rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-900/5">
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-7 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
          <div className="h-2 animate-pulse rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  )
}

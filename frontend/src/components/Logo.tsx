import { TruckIcon } from './Icons'

/** App mark and name, used in the landing nav and the planner header. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex items-center justify-center bg-accent shadow-md shadow-accent/30 ${
          large ? 'h-10 w-10 rounded-xl' : 'h-9 w-9 rounded-lg'
        }`}
      >
        <TruckIcon size={large ? 21 : 18} className="text-white" />
      </span>
      <span className={`font-extrabold tracking-tight ${large ? 'text-lg' : 'text-base'}`}>
        Weather-Aware <span className="text-accent">Truck Routing</span>
      </span>
    </span>
  )
}

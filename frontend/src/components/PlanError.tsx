import { AlertIcon, CloseIcon } from './Icons'

interface Props {
  message: string
  onEdit: () => void
  onDismiss: () => void
}

/** Why planning failed, with a way to change the trip. */
export function PlanError({ message, onEdit, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="card-in flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <AlertIcon size={18} className="mt-0.5 shrink-0 text-red-600" />
      <div className="flex-1">
        <p>{message}</p>
        <button type="button" onClick={onEdit} className="mt-1.5 font-semibold text-red-700 underline">
          Change the trip
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded p-0.5 text-red-500 transition hover:bg-red-100 hover:text-red-700"
      >
        <CloseIcon size={15} />
      </button>
    </div>
  )
}

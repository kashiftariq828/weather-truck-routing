import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CloseIcon } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * Accessible dialog. It stays mounted while closed (just hidden) so whatever the user
 * typed is still there when it opens again, e.g. via "Edit trip".
 */
export function Modal({ open, onClose, title, subtitle, children }: Props) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    // Focus the first empty field (or the first field) so the user can start typing straight away.
    const fields = [...(panel.current?.querySelectorAll<HTMLInputElement>('input') ?? [])]
    ;(fields.find((f) => !f.value) ?? fields[0])?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={open ? 'fixed inset-0 z-50 flex items-center justify-center p-4' : 'hidden'}>
      <div className="fade-in absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-in relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-brand-50 to-white px-6 pt-5 pb-4">
          <div>
            <h2 id={titleId} className="text-xl font-extrabold tracking-tight text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-700">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

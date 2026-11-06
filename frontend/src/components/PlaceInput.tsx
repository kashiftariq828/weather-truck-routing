import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { geocode, type Place } from '../api'

interface Props {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
  placeholder?: string
  icon?: ReactNode
}

const DEBOUNCE_MS = 300

/** Address autocomplete backed by /api/geocode, with keyboard navigation. */
export function PlaceInput({ label, value, onChange, placeholder, icon }: Props) {
  const id = useId()
  const [text, setText] = useState(value?.label ?? '')
  const [options, setOptions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const typed = useRef(false)

  // Keep the box in sync when the parent sets a place (e.g. an example trip).
  useEffect(() => {
    if (!value) return
    typed.current = false
    setText(value.label)
  }, [value])

  useEffect(() => {
    if (!typed.current || text.trim().length < 3) {
      setOptions([])
      setLoading(false) // an aborted lookup never reaches its own `finally`
      setError(null)
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const places = await geocode(text, ctrl.signal)
        setOptions(places)
        setActive(0)
        setOpen(places.length > 0)
        setError(places.length ? null : 'No matches')
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [text])

  const choose = (p: Place) => {
    onChange(p)
    setOpen(false)
    setOptions([])
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !options.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
        {label}
      </label>
      {icon && <span className="pointer-events-none absolute top-[30px] left-3 text-slate-600">{icon}</span>}
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          typed.current = true
          setText(e.target.value)
          if (value) onChange(null)
        }}
        onKeyDown={onKeyDown}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`w-full rounded-lg border bg-white py-2 pr-8 text-sm shadow-sm transition outline-none placeholder:text-slate-500 focus:border-brand-light focus:ring-3 focus:ring-brand-light/20 ${
          icon ? 'pl-9' : 'pl-3'
        } ${value ? 'border-emerald-500/70' : 'border-slate-300'}`}
      />
      {loading && (
        <span
          className="spinner absolute top-[31px] right-3 h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-brand-light"
          aria-label="Searching"
        />
      )}
      {value && !loading && <span className="absolute top-[29px] right-3 text-sm text-emerald-600">✓</span>}
      {open && options.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="fade-in absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
        >
          {options.map((p, i) => (
            <li
              key={`${p.label}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={() => choose(p)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 transition-colors ${i === active ? 'bg-brand-50 text-brand' : 'text-slate-700'}`}
            >
              {p.label}
            </li>
          ))}
        </ul>
      )}
      {error && !open && typed.current && !value && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

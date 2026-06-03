import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GLOSSARY_RE, lookup } from '../data/glossary'

/** A glossary term: dotted underline; tap or hover reveals a plain definition. */
function GlossaryTerm({ label, definition }: { label: string; definition: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`What is ${label}? ${definition}`}
        className="cursor-help font-semibold text-inherit underline decoration-dotted decoration-2 underline-offset-2"
      >
        {label}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 block w-64 rounded-xl bg-slate-900 px-3 py-2 text-left text-sm font-normal leading-snug text-white shadow-xl"
          // keep within viewport-ish on small screens
          style={{ maxWidth: 'min(16rem, 80vw)' }}
        >
          <span className="mb-0.5 block font-semibold text-white">{label}</span>
          <span className="block text-slate-200">{definition}</span>
        </span>
      )}
    </span>
  )
}

/**
 * Render `text`, turning any known glossary term into a tappable definition.
 * Plain text passes through unchanged.
 */
export function Glossarize({ text }: { text: string }): ReactNode {
  if (!text) return null
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  GLOSSARY_RE.lastIndex = 0
  let i = 0
  while ((m = GLOSSARY_RE.exec(text)) !== null) {
    const def = lookup(m[0])
    if (!def) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<GlossaryTerm key={i++} label={m[0]} definition={def} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

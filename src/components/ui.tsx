import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-800',
  secondary: 'bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
}

export function Button({
  variant = 'primary',
  full,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export function Pill({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'sky' | 'teal' | 'emerald' | 'amber' | 'rose'
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    sky: 'bg-sky-100 text-sky-800',
    teal: 'bg-teal-100 text-teal-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-800',
  }
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tones[tone]}`}>{children}</span>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-500">{children}</h2>
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl bg-white px-4 py-4 text-left ring-1 ring-slate-200"
    >
      <span>
        <span className="block text-base font-semibold text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-slate-500">{description}</span>}
      </span>
      <span
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
    </button>
  )
}

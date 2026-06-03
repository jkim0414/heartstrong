import type { ISODate } from '../types'

/** Local-timezone YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

/** Parse a YYYY-MM-DD into a local Date at midnight. */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Whole days from a -> b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function weeksSince(from: ISODate, to: ISODate = todayISO()): number {
  return Math.floor(daysBetween(from, to) / 7)
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(s: ISODate): number {
  return parseISODate(s).getDay()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function formatLong(s: ISODate): string {
  const d = parseISODate(s)
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function formatShort(s: ISODate): string {
  const d = parseISODate(s)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** Deterministic 32-bit hash of a string (for seeding daily variety). */
export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded PRNG (mulberry32). Returns a function producing floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

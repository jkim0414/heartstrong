import type { EquipmentItem } from '../types'

export interface CatalogEntry {
  id: string
  label: string
  /** Short note shown when adding. */
  blurb: string
  /** Items with adjustable/selectable weights (lb). */
  loadable?: boolean
  /** Default weights to seed when first added. */
  defaultWeightsLb?: number[]
  /** Always present, can't be removed. */
  fixed?: boolean
  /** Seeded as owned in a fresh install. */
  defaultOwned?: boolean
}

// The built-in catalog. Movements in data/movements.ts reference these ids.
// Adding any of these to "owned" actually changes the programming.
export const EQUIPMENT_CATALOG: CatalogEntry[] = [
  { id: 'bodyweight', label: 'Bodyweight movements', blurb: 'Always available.', fixed: true, defaultOwned: true },
  { id: 'openspace', label: 'Space to walk / move', blurb: 'Room to walk, march, or shuttle.', fixed: true, defaultOwned: true },
  { id: 'bench', label: 'Workout bench', blurb: 'Step-ups, sit-to-stands, supported rows, incline push-ups.', defaultOwned: true },
  { id: 'jumprope', label: 'Jump rope', blurb: 'Coordination and (later) low-impact conditioning.', defaultOwned: true },
  { id: 'dumbbells', label: 'Dumbbells', blurb: 'The backbone of home strength work.', loadable: true, defaultWeightsLb: [20, 30], defaultOwned: true },
  { id: 'kettlebell', label: 'Kettlebell', blurb: 'Swings, goblet squats, carries — superb for the engine and posterior chain.', loadable: true, defaultWeightsLb: [25] },
  { id: 'bands', label: 'Resistance bands', blurb: 'Joint-friendly, scalable pulling and pressing — gentle reintroduction of upper-body work.' },
  { id: 'trx', label: 'Suspension trainer (TRX)', blurb: 'Angle-adjustable rows and squats; very scalable and back-friendly.' },
  { id: 'medball', label: 'Medicine / wall ball', blurb: 'Full-body conditioning (wall balls) and core.', loadable: true, defaultWeightsLb: [10] },
  { id: 'pullupbar', label: 'Pull-up bar', blurb: 'Advanced pulling; assisted to start.' },
  { id: 'barbell', label: 'Barbell + plates', blurb: 'Heavy, progressable squats, deadlifts, presses (later phases).', loadable: true, defaultWeightsLb: [45] },
  { id: 'box', label: 'Plyo / step box', blurb: 'Step-ups and box squats at a set height.' },
  { id: 'rower', label: 'Rowing machine', blurb: 'Gold-standard low-impact conditioning once your chest has healed.' },
]

export const CATALOG_BY_ID: Record<string, CatalogEntry> = Object.fromEntries(EQUIPMENT_CATALOG.map((e) => [e.id, e]))

export function defaultEquipment(): EquipmentItem[] {
  return EQUIPMENT_CATALOG.filter((e) => e.defaultOwned).map((e) => ({
    id: e.id,
    label: e.label,
    owned: true,
    fixed: e.fixed,
    weightsLb: e.loadable ? e.defaultWeightsLb : undefined,
  }))
}

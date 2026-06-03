// Plain-language definitions for terms a layperson (esp. someone new to
// strength/CrossFit-style training) may not know. Keys are matched
// case-insensitively against displayed workout text.

export const GLOSSARY: Record<string, string> = {
  amrap: 'As Many Rounds As Possible — do the listed moves in order, then repeat from the top as many times as you can in the set time. Steady pace, not a sprint.',
  emom: 'Every Minute On the Minute — at the start of each minute do the listed reps, then rest for whatever is left of that minute.',
  'rounds for time': 'Do the listed number of rounds at a steady pace. You can note how long it took to see progress over time.',
  metcon: '“Metabolic conditioning” — the part of the workout that gets your heart and lungs working, like cardio mixed with movements.',
  superset: 'Two exercises done back-to-back with little or no rest between them.',
  ladder: 'A rep scheme where the number of reps goes up (or down) each round.',
  interval: 'Alternating short bouts of harder work with easier recovery.',
  intervals: 'Alternating short bouts of harder work with easier recovery.',
  rpe: 'Rate of Perceived Exertion — how hard it feels, on a 0–10 scale. We use this instead of heart rate because your medication changes your heart rate.',
  'talk test': 'A simple intensity gauge: the more breathless you are, the fewer words you can say at once. It tells you how hard you’re working.',
  hinge: 'Bending by pushing your hips back (like closing a car door with your behind) while keeping a flat back — not rounding at the waist.',
  'posterior chain': 'The muscles along the back of your body — glutes, hamstrings, and back.',
  goblet: 'Holding a single weight up against your chest with both hands.',
  thruster: 'A squat that flows straight up into pressing the weight overhead in one motion.',
  rdl: 'Romanian deadlift — a hip-hinge that works the back of the legs; you lower the weight down your shins with a flat back, then stand tall.',
  'romanian deadlift': 'A hip-hinge that works the back of the legs; you lower the weight down your shins with a flat back, then stand tall.',
}

// Build one regex matching any term, longest first so multi-word wins.
const TERMS = Object.keys(GLOSSARY)
  .sort((a, b) => b.length - a.length)
  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

export const GLOSSARY_RE = new RegExp(`\\b(${TERMS.join('|')})\\b`, 'gi')

export function lookup(term: string): string | undefined {
  return GLOSSARY[term.toLowerCase()]
}

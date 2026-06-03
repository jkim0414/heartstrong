// Minimal .env.local reader (file-first, so it isn't fooled by variables that
// happen to be pre-set in the surrounding shell).
import { readFileSync } from 'node:fs'

export function readEnv(path = '.env.local') {
  const out = {}
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch {
    /* file may not exist yet */
  }
  return out
}

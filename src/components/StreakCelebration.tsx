import { useEffect } from 'react'
import { Button } from './ui'

const COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

/** Milestone-aware copy so the celebration feels earned, not generic. */
function streakCopy(streak: number): { headline: string; sub: string } {
  if (streak <= 1) return { headline: 'Streak started!', sub: 'Day one. The hardest rep is just showing up — and you did.' }
  if (streak === 3) return { headline: '3-day streak!', sub: 'Three days running. This is becoming a habit.' }
  if (streak === 7) return { headline: 'One-week streak!', sub: 'A full week of showing up. Your heart is thanking you.' }
  if (streak === 30) return { headline: '30-day streak!', sub: 'A whole month. This is just who you are now.' }
  if (streak % 7 === 0) return { headline: `${streak / 7}-week streak!`, sub: 'Week after week. Consistency is the whole game.' }
  return { headline: `${streak}-day streak!`, sub: 'Come back tomorrow to keep the flame alive.' }
}

/**
 * Full-screen, tap-to-dismiss celebration shown when the user logs a workout
 * that extends (or starts) their streak. Auto-dismisses after a few seconds.
 * Animations degrade gracefully under prefers-reduced-motion (handled globally).
 */
export function StreakCelebration({ streak, onClose }: { streak: number; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose])

  const { headline, sub } = streakCopy(streak)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={`${headline} ${sub}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-6 backdrop-blur-sm"
    >
      {/* Confetti — purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {Array.from({ length: 26 }, (_, i) => {
          const size = 8 + Math.round(Math.random() * 6)
          return (
            <span
              key={i}
              className="absolute top-0 block"
              style={{
                left: `${Math.random() * 100}%`,
                width: size,
                height: Math.round(size * 1.4),
                background: COLORS[i % COLORS.length],
                borderRadius: 2,
                animationName: 'confetti-fall',
                animationTimingFunction: 'linear',
                animationFillMode: 'forwards',
                animationDuration: `${2.4 + Math.random() * 1.6}s`,
                animationDelay: `${Math.random() * 0.6}s`,
              }}
            />
          )
        })}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs rounded-3xl bg-white p-8 text-center shadow-2xl"
        style={{ animationName: 'pop-in', animationDuration: '0.4s', animationTimingFunction: 'ease-out' }}
      >
        <div
          aria-hidden
          className="text-7xl leading-none"
          style={{ animationName: 'flame-pulse', animationDuration: '1.4s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite' }}
        >
          🔥
        </div>
        <p className="mt-1 text-6xl font-extrabold text-amber-500">{streak}</p>
        <p className="mt-2 text-2xl font-extrabold text-slate-900">{headline}</p>
        <p className="mt-2 text-base text-slate-600">{sub}</p>
        <Button full className="mt-6" onClick={onClose}>
          Keep it going
        </Button>
      </div>
    </div>
  )
}

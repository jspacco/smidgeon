import { useEffect, useState } from 'react'

interface CountUpTimerProps {
  startedAt: string | null
  running: boolean
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function CountUpTimer({ startedAt, running }: CountUpTimerProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!running || !startedAt) {
      setElapsed(0)
      return
    }

    const start = new Date(startedAt).getTime()

    const tick = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running, startedAt])

  return (
    <span className="font-mono tabular-nums" aria-label={`Timer: ${formatSeconds(elapsed)}`}>
      {formatSeconds(elapsed)}
    </span>
  )
}

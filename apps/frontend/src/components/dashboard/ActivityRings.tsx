import { useMemo } from 'react'

export interface ActivityRingData {
  deviceName: string
  deviceType: string
  onHours: number
  color: string
}

export interface ActivityRingsProps {
  data: ActivityRingData[]
  isLoading?: boolean
}

const RING_COLORS = [
  { main: '#FA114F', glow: '#FA114F' },   // Red (outermost)
  { main: '#92E82A', glow: '#92E82A' },   // Green
  { main: '#00D4FF', glow: '#00D4FF' },   // Cyan
  { main: '#5E5CE6', glow: '#5E5CE6' },   // Blue
  { main: '#F770C8FF', glow: '#F770C8FF' },   // Pink (innermost)
]

const SIZE = 220
const CENTER = SIZE / 2
const STROKE_WIDTH = 16
const GAP = 4
const MAX_HOURS = 24

export function ActivityRings({ data, isLoading }: ActivityRingsProps) {
  const rings = useMemo(() => {
    return data.slice(0, 5).map((item, index) => {
      const radius = CENTER - STROKE_WIDTH / 2 - index * (STROKE_WIDTH + GAP) - 10
      const circumference = 2 * Math.PI * radius
      const fraction = Math.min(item.onHours / MAX_HOURS, 1)
      const dashOffset = circumference * (1 - fraction)

      return {
        ...item,
        radius,
        circumference,
        fraction,
        dashOffset,
        ringColor: RING_COLORS[index] || RING_COLORS[0],
        endAngle: fraction * 360,
      }
    })
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-8 py-2 h-full">
        <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
          {/* Loading skeleton rings */}
          {[0, 1, 2, 3, 4].map((i) => {
            const r = CENTER - STROKE_WIDTH / 2 - i * (STROKE_WIDTH + GAP) - 10
            return (
              <svg key={i} width={SIZE} height={SIZE} className="absolute inset-0 animate-pulse">
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE_WIDTH}
                  className="text-muted-foreground/10"
                />
              </svg>
            )
          })}
        </div>
        <span className="text-sm text-muted-foreground animate-pulse">Loading activity data...</span>
      </div>
    )
  }

  if (!rings.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 h-full text-muted-foreground">
        <span className="text-sm font-medium">No device activity for this day</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-8 h-full">
      {/* Ring SVG */}
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          <defs>
            {rings.map((ring, i) => (
              <linearGradient key={`grad-${i}`} id={`ring-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ring.ringColor.main} />
                <stop offset="100%" stopColor={ring.ringColor.main} stopOpacity={0.7} />
              </linearGradient>
            ))}
          </defs>

          {/* Track circles (dark background rings) */}
          {rings.map((ring, i) => (
            <circle
              key={`track-${i}`}
              cx={CENTER}
              cy={CENTER}
              r={ring.radius}
              fill="none"
              stroke={ring.ringColor.main}
              strokeWidth={STROKE_WIDTH}
              opacity={0.15}
            />
          ))}

          {/* Filled arcs */}
          {rings.map((ring, i) => (
            <circle
              key={`arc-${i}`}
              cx={CENTER}
              cy={CENTER}
              r={ring.radius}
              fill="none"
              stroke={`url(#ring-grad-${i})`}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={ring.circumference}
              strokeDashoffset={ring.dashOffset}
              className="transition-all duration-1000 ease-out"
            />
          ))}

          {/* End cap circles (the rounded tip with a small bright dot) */}
          {rings.map((ring, i) => {
            if (ring.fraction <= 0) return null
            const angleRad = (ring.endAngle * Math.PI) / 180
            const capX = CENTER + ring.radius * Math.cos(angleRad)
            const capY = CENTER + ring.radius * Math.sin(angleRad)
            return (
              <circle
                key={`cap-${i}`}
                cx={capX}
                cy={capY}
                r={STROKE_WIDTH / 2 - 1}
                fill={ring.ringColor.main}
                className="transition-all duration-1000 ease-out"
              />
            )
          })}
        </svg>
      </div>

      {/* Legend – right side */}
      <div className="flex flex-col justify-center gap-3">
        {rings.map((ring, i) => {
          const hours = Math.floor(ring.onHours)
          const mins = Math.round((ring.onHours - hours) * 60)
          const timeStr = hours > 0 && mins > 0
            ? `${hours}h ${mins}m`
            : hours > 0
              ? `${hours}h`
              : `${mins}m`
          return (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: ring.ringColor.main,
                }}
              />
              <span className="truncate max-w-[130px] text-muted-foreground font-medium">{ring.deviceName}</span>
              <span className="text-foreground font-semibold tabular-nums ml-auto">{timeStr}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

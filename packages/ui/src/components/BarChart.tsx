interface BarChartProps {
  /** Map of option label ("A", "B", …) to count */
  data: Record<string, number>
  /** Total respondents for percentage calculation */
  total: number
  /** Highlight the student's own answer */
  highlightOption?: string
  /** Show a second round side by side for revote comparison */
  round2Data?: Record<string, number>
  round2Total?: number
}

export function BarChart({ data, total, highlightOption, round2Data, round2Total }: BarChartProps) {
  const options = Object.keys(data).sort()
  const maxCount = Math.max(...Object.values(data), round2Data ? Math.max(...Object.values(round2Data)) : 0, 1)

  return (
    <div className="flex gap-2 items-end h-48" role="img" aria-label="Response distribution bar chart">
      {options.map((opt) => {
        const count1 = data[opt] ?? 0
        const pct1 = total > 0 ? Math.round((count1 / total) * 100) : 0
        const height1 = `${(count1 / maxCount) * 100}%`

        const count2 = round2Data?.[opt] ?? 0
        const pct2 = round2Total && round2Total > 0 ? Math.round((count2 / round2Total) * 100) : null
        const height2 = round2Data ? `${(count2 / maxCount) * 100}%` : null

        const isHighlighted = opt === highlightOption

        return (
          <div key={opt} className="flex flex-col items-center gap-1 flex-1">
            <div className="flex gap-0.5 items-end w-full h-40">
              {/* Round 1 bar */}
              <div className="flex-1 flex flex-col justify-end h-full">
                <div
                  className={[
                    'w-full rounded-t transition-all duration-300',
                    isHighlighted ? 'bg-blue-600' : 'bg-gray-400',
                  ].join(' ')}
                  style={{ height: height1 }}
                  aria-label={`${opt}: ${count1} (${pct1}%)`}
                />
              </div>
              {/* Round 2 bar — shown only for revote comparison */}
              {height2 !== null && (
                <div className="flex-1 flex flex-col justify-end h-full">
                  <div
                    className="w-full rounded-t bg-blue-300 transition-all duration-300"
                    style={{ height: height2 }}
                    aria-label={`${opt} round 2: ${count2} (${pct2 ?? 0}%)`}
                  />
                </div>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-700">{opt}</span>
            <span className="text-xs text-gray-500">{pct1}%</span>
          </div>
        )
      })}
    </div>
  )
}

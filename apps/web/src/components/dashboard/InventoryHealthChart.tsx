import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS: Record<string, string> = {
  Healthy: '#10b981',
  'Low Stock': '#f59e0b',
  'Out of Stock': '#f43f5e',
}

export function InventoryHealthChart({ healthy, low, out }: { healthy: number; low: number; out: number }) {
  const data = [
    { name: 'Healthy', value: healthy },
    { name: 'Low Stock', value: low },
    { name: 'Out of Stock', value: out },
  ].filter((d) => d.value > 0)

  const total = healthy + low + out

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={62} paddingAngle={data.length > 1 ? 3 : 0} stroke="none">
              {data.map((d) => (
                <Cell key={d.name} fill={COLORS[d.name]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(value, name) => [`${value} lines`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-bold text-ink-900">{total}</span>
          <span className="text-[10px] text-ink-400">lines</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {[
          { label: 'Healthy', value: healthy, color: COLORS.Healthy },
          { label: 'Low Stock', value: low, color: COLORS['Low Stock'] },
          { label: 'Out of Stock', value: out, color: COLORS['Out of Stock'] },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="text-ink-600">{row.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink-900">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

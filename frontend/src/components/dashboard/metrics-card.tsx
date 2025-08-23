import { Card, CardContent } from '@/components/ui/card'

interface MetricsCardProps {
  title: string
  value: number | string
  icon: string
  trend?: {
    value: number
    isPositive: boolean
  }
  subtitle?: string
}

export function MetricsCard({ title, value, icon, trend, subtitle }: MetricsCardProps) {
  const formatValue = (val: number | string) => {
    if (typeof val === 'number') {
      return val.toLocaleString()
    }
    return val
  }

  return (
    <Card variant="stats">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{formatValue(value)}</p>
              {trend && (
                <span className={`text-xs font-medium ${
                  trend.isPositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  {trend.isPositive ? '↗' : '↘'} {Math.abs(trend.value)}%
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="text-3xl opacity-60">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
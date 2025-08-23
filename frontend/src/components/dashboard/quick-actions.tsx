import { Card } from '@/components/ui/card'

interface QuickAction {
  id: string
  title: string
  description: string
  icon: string
  onClick: () => void
}

interface QuickActionsProps {
  actions?: QuickAction[]
}

const defaultActions: QuickAction[] = [
  {
    id: 'add-part',
    title: 'Add New Part',
    description: 'Register a new electronic component',
    icon: '🔧',
    onClick: () => console.log('Navigate to add part')
  },
  {
    id: 'scan-part',
    title: 'Scan Part',
    description: 'Use camera to identify and add parts',
    icon: '📱',
    onClick: () => console.log('Open camera scanner')
  },
  {
    id: 'organize-storage',
    title: 'Organize Storage',
    description: 'Get suggestions for better organization',
    icon: '📦',
    onClick: () => console.log('Start organization wizard')
  },
  {
    id: 'shopping-list',
    title: 'Shopping List',
    description: 'View and manage parts to purchase',
    icon: '🛒',
    onClick: () => console.log('Navigate to shopping list')
  },
  {
    id: 'new-project',
    title: 'Start Project',
    description: 'Plan a new electronics project',
    icon: '⚡',
    onClick: () => console.log('Create new project')
  },
  {
    id: 'search-parts',
    title: 'Advanced Search',
    description: 'Find parts with detailed filters',
    icon: '🔍',
    onClick: () => console.log('Navigate to search')
  }
]

export function QuickActions({ actions = defaultActions }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {actions.map((action) => (
        <Card
          key={action.id}
          variant="action"
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={action.onClick}
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl mt-1">
              {action.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm mb-1">{action.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {action.description}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
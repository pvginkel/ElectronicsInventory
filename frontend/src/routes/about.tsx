import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { IconBadge } from '@/components/ui'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  const features = [
    {
      icon: '🔧',
      title: 'Detailed Part Tracking',
      description: 'Track components with unique 4-letter IDs, manufacturer codes, technical specs (package, pin count, voltage), and extensive documentation.'
    },
    {
      icon: '📦',
      title: 'Multi-Location Storage',
      description: 'Organize parts across numbered boxes and locations. A single part can exist in multiple locations with tracked quantities.'
    },
    {
      icon: '🛒',
      title: 'Procurement Workflow',
      description: 'Shopping lists with three-phase workflow: concept planning, ordering from vendors, and receiving into inventory.'
    },
    {
      icon: '🔨',
      title: 'Kit Assembly',
      description: 'Define kits with bills of materials, build targets, and location-specific pick lists for repeatable assembly workflows.'
    },
    {
      icon: '🤖',
      title: 'AI Part Analysis',
      description: 'Upload photos or descriptions to automatically identify parts, extract specifications, and fetch datasheets.'
    }
  ]

  const quickStartSteps = [
    {
      step: '1',
      title: 'Set Up Storage',
      description: 'Create numbered boxes with configurable capacity. Each box contains numbered locations for organizing parts.'
    },
    {
      step: '2',
      title: 'Add Parts',
      description: 'Use AI analysis from photos or manually enter manufacturer codes, technical specs, and documentation. Each part gets a unique 4-letter ID.'
    },
    {
      step: '3',
      title: 'Track Inventory',
      description: 'Assign quantities to specific box-location combinations. Parts can exist in multiple locations simultaneously.'
    },
    {
      step: '4',
      title: 'Build Workflows',
      description: 'Create shopping lists for procurement, define kits for assembly, and generate pick lists for building.'
    }
  ]

  return (
    <div className="space-y-8 p-6" data-testid="about.page">
      {/* Hero Section */}
      <div className="text-center py-12" data-testid="about.hero">
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Electronics Inventory System
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          A production-grade inventory management system for electronics enthusiasts and small-scale manufacturers.
          Track parts, manage procurement, coordinate assembly, and maintain complete documentation.
        </p>
      </div>

      {/* Features Grid */}
      <div data-testid="about.features">
        <h2 className="text-3xl font-bold text-center mb-8">Key Features</h2>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          data-testid="about.features.grid"
        >
          {features.map((feature, index) => (
            <Card
              key={index}
              className="text-center"
              data-testid="about.features.item"
              data-feature-index={index}
            >
              <CardContent className="pt-6" data-testid="about.features.item.content">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Start Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" data-testid="about.quickstart.section">
        <Card data-testid="about.quickstart">
          <CardHeader>
            <CardTitle className="text-2xl">Quick Start Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {quickStartSteps.map((step, index) => (
              <div
                key={index}
                className="flex gap-4"
                data-testid="about.quickstart.step"
                data-step={step.step}
              >
                <IconBadge size="sm" variant="primary">
                  {step.step}
                </IconBadge>
                <div className="flex-1">
                  <h3 className="font-medium mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="about.overview">
          <CardHeader>
            <CardTitle className="text-2xl">System Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">🏷️ Comprehensive Part Data</h3>
              <p className="text-sm text-muted-foreground">
                Beyond basic tracking, capture technical specs: package type, pin count, voltage ratings,
                mounting type, dimensions, and more. Attach datasheets, images, and links.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">📍 Flexible Inventory</h3>
              <p className="text-sm text-muted-foreground">
                Parts can exist in multiple storage locations simultaneously with tracked quantities.
                Complete quantity history maintains an audit trail of all changes.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">🛒 Procurement Pipeline</h3>
              <p className="text-sm text-muted-foreground">
                Shopping lists progress through concept, ordering, and receiving phases.
                Track orders by seller, manage vendor relationships, and receive stock into inventory.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">🔨 Assembly Workflows</h3>
              <p className="text-sm text-muted-foreground">
                Define kits with bills of materials and build targets. Generate location-specific
                pick lists for assembly. Link shopping lists to procure missing components.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

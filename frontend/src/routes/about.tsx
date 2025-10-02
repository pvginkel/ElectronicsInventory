import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  const features = [
    {
      icon: '🔧',
      title: 'Smart Part Management',
      description: 'Organize electronic components with unique 4-letter IDs and intelligent categorization.'
    },
    {
      icon: '📦',
      title: 'Flexible Storage',
      description: 'Track parts across numbered boxes and locations with automatic organization suggestions.'
    },
    {
      icon: '🔍',
      title: 'Powerful Search',
      description: 'Find parts quickly by ID, manufacturer code, category, or any description text.'
    },
    {
      icon: '📱',
      title: 'Mobile Scanning',
      description: 'Use your device camera to identify parts and automatically fetch datasheets.'
    },
    {
      icon: '🛒',
      title: 'Shopping Lists',
      description: 'Keep track of parts you need to order and convert them to inventory when they arrive.'
    },
    {
      icon: '⚡',
      title: 'Project Planning',
      description: 'Plan electronics projects, track required parts, and manage build workflows.'
    }
  ]

  const quickStartSteps = [
    {
      step: '1',
      title: 'Create Storage Boxes',
      description: 'Set up numbered boxes with locations to organize your components.'
    },
    {
      step: '2',
      title: 'Add Your First Part',
      description: 'Register a component with manufacturer code, category, and quantity.'
    },
    {
      step: '3',
      title: 'Assign Storage Location',
      description: 'Place the part in a box location and print the generated ID label.'
    },
    {
      step: '4',
      title: 'Start Organizing',
      description: 'Use reorganization suggestions to keep similar parts together.'
    }
  ]

  return (
    <div className="space-y-8" data-testid="about.page">
      {/* Hero Section */}
      <div className="text-center py-12" data-testid="about.hero">
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Electronics Inventory System
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          A modern, intelligent solution for managing your hobby electronics parts. 
          Keep track of what you have, where it is, and how to get more.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" data-testid="about.hero.cta.add-part">
            <span className="mr-2">➕</span>
            Add Your First Part
          </Button>
          <Button variant="outline" size="lg" data-testid="about.hero.cta.documentation">
            <span className="mr-2">📖</span>
            View Documentation
          </Button>
        </div>
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
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                  {step.step}
                </div>
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
            <CardTitle className="text-2xl">System Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">🏷️ Part Management</h3>
              <p className="text-sm text-muted-foreground">
                Each component gets a unique 4-letter ID for easy identification and labeling. 
                Track manufacturer codes, categories, quantities, and attach documentation.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">📍 Smart Storage</h3>
              <p className="text-sm text-muted-foreground">
                Organize parts in numbered boxes with locations. The system suggests optimal 
                placement to keep similar components together.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">🤖 AI-Powered</h3>
              <p className="text-sm text-muted-foreground">
                Get automatic part recognition from photos, intelligent tagging, 
                and reorganization suggestions to maintain an organized inventory.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">📊 Project Ready</h3>
              <p className="text-sm text-muted-foreground">
                Plan projects, track required parts, manage shopping lists, 
                and see what you have available for your next build.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call to Action */}
      <Card className="text-center bg-muted/30" data-testid="about.cta">
        <CardContent className="py-12">
          <h2 className="text-2xl font-bold mb-4">Ready to Get Organized?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Start managing your electronics inventory with modern tools designed for makers.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" data-testid="about.cta.get-started">
              <span className="mr-2">🚀</span>
              Get Started
            </Button>
            <Button variant="outline" size="lg" data-testid="about.cta.view-dashboard">
              <span className="mr-2">📊</span>
              View Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

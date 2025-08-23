import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  onMenuToggle?: () => void
  isMobile?: boolean
}

export function Header({ onMenuToggle, isMobile = false }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // TODO: Implement search navigation
      console.log('Searching for:', searchQuery)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <header className="h-16 border-b border-border bg-background px-4">
      <div className="flex h-full items-center justify-between">
        {/* Left section - Mobile menu button */}
        <div className="flex items-center gap-4">
          {isMobile && onMenuToggle && (
            <button
              onClick={onMenuToggle}
              className="rounded-md p-2 hover:bg-accent lg:hidden"
            >
              <span className="text-xl">☰</span>
            </button>
          )}
          
          {/* Global search bar */}
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64 md:w-80">
              <Input
                placeholder="Search parts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                icon={<span className="text-muted-foreground">🔍</span>}
                className="text-sm"
              />
            </div>
            <Button onClick={handleSearch} size="sm" variant="outline" className="hidden sm:inline-flex">
              Search
            </Button>
          </div>
        </div>

        {/* Right section - Quick actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="hidden md:inline-flex">
            <span className="mr-1">📱</span>
            Scan
          </Button>
          <Button size="sm" className="hidden sm:inline-flex">
            <span className="mr-1">➕</span>
            Add Part
          </Button>
          <Button size="sm" className="sm:hidden">
            ➕
          </Button>
        </div>
      </div>
    </header>
  )
}
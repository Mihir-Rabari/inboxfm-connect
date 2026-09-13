import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CommandPalette } from './command-palette'
import { ErrorBoundary } from './error-boundary'
import { Header } from './header'
import { Sidebar } from './sidebar'
import { Toaster } from '@/components/ui/sonner'


export function AppShell() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 260px Left Sidebar */}
      <Sidebar />

      {/* Main View Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onOpenCommandPalette={() => setCommandPaletteOpen(true)} />

        {/* Content Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
          <div className="mx-auto max-w-7xl">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Global Command Palette & Toaster */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
      <Toaster position="bottom-right" richColors />
    </div>
  )
}

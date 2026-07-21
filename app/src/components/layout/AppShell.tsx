import type { ReactNode } from 'react'

interface AppShellProps {
  topbar: ReactNode
  sidebar?: ReactNode
  children: ReactNode
}

export function AppShell({ topbar, sidebar, children }: AppShellProps) {
  return (
    <div className="deek-app-bg h-screen overflow-hidden text-[var(--foreground)]">
      <header className="h-12 border-b border-[var(--topbar-border)] bg-[var(--topbar-bg)] shadow-[var(--glass-highlight)] backdrop-blur-[var(--glass-blur)]">
        {topbar}
      </header>
      <div className={sidebar ? 'grid h-[calc(100vh-48px)] min-h-0 grid-cols-[250px_minmax(0,1fr)] gap-px' : 'h-[calc(100vh-48px)] min-h-0'}>
        {sidebar ? <aside className="border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-[var(--glass-highlight)] backdrop-blur-[var(--glass-blur)]">{sidebar}</aside> : null}
        <div className="h-full min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

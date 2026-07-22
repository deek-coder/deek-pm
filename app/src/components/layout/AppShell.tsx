import type { ReactNode } from 'react'
import { cn } from '../../shared/cn'

interface AppShellProps {
  topbar: ReactNode
  sidebar?: ReactNode
  children: ReactNode
}

/**
 * Window chrome layout.
 * HIG notes used here (not pixel-copy):
 * - Sidebar needs real horizontal/vertical room; size scales with window.
 * - Content fills the remaining area; page-level max-width keeps large displays readable.
 * - Don't pin critical actions to the bottom edge of the window.
 */
export function AppShell({ topbar, sidebar, children }: AppShellProps) {
  return (
    <div className="deek-app-bg deek-shell flex h-screen flex-col overflow-hidden text-[var(--foreground)]">
      <header className="deek-shell-titlebar relative z-20 h-[var(--shell-titlebar-h,3.25rem)] shrink-0 border-b border-[var(--topbar-border)] bg-[var(--topbar-bg)] shadow-[var(--glass-highlight)] backdrop-blur-[var(--glass-blur)] saturate-[var(--glass-saturate)]">
        {topbar}
      </header>
      <div
        className={cn(
          'deek-shell-body flex min-h-0 flex-1',
          sidebar ? 'flex-row' : '',
        )}
      >
        {sidebar ? (
          <aside className="deek-shell-sidebar flex w-[var(--shell-sidebar-width)] shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-[var(--glass-highlight)] backdrop-blur-[var(--glass-blur)] saturate-[var(--glass-saturate)]">
            {sidebar}
          </aside>
        ) : null}
        <div className="deek-shell-content relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg,transparent)]">
          {children}
        </div>
      </div>
    </div>
  )
}

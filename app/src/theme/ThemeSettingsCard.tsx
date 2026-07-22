import { Check, Palette } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { cn } from '../shared/cn'
import { useTheme } from './themeContext'
import type { AppThemeId } from './theme'

export function ThemeSettingsCard({ className }: { className?: string }) {
  const { theme, themes, setTheme } = useTheme()

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-control)] border border-[var(--glass-border)] bg-[var(--glass-bg)] text-muted-foreground">
            <Palette size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">外观主题</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              保留原有 Deek Glass，也可切换到贴近最新 macOS 系统的主题。选择会保存在本机。
            </p>
          </div>
        </div>
        <Badge variant="secondary">{themes.find((item) => item.id === theme)?.name ?? theme}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {themes.map((option) => {
          const active = option.id === theme
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id as AppThemeId)}
              className={cn(
                'rounded-[var(--radius-panel)] border p-3 text-left transition',
                'hover:border-[var(--border-strong)] hover:bg-[var(--nav-item-hover-bg)]',
                active
                  ? 'border-[var(--theme-accent,var(--border-strong))] bg-[var(--nav-item-active-bg)] shadow-[var(--shadow-control)] ring-1 ring-[var(--theme-accent,var(--ring))]/25'
                  : 'border-[var(--glass-border)] bg-[var(--glass-bg)]',
              )}
            >
              <div
                className="relative overflow-hidden rounded-[calc(var(--radius-control)+2px)] border border-black/5 p-3"
                style={{ background: option.preview.background }}
              >
                <div
                  className="mb-2 h-8 rounded-md border border-white/50 shadow-sm"
                  style={{ background: option.preview.surface }}
                />
                <div className="flex items-center gap-2">
                  <span className="h-5 w-12 rounded-full" style={{ background: option.preview.accent }} />
                  <span className="h-2 flex-1 rounded-full opacity-70" style={{ background: option.preview.text }} />
                </div>
                {active ? (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full text-white" style={{ background: option.preview.accent }}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{option.name}</strong>
                  {active ? <Badge>使用中</Badge> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

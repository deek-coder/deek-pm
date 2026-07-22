import type { ReactNode } from 'react'
import { cn } from '../../shared/cn'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('deek-page-header flex items-start justify-between gap-5', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <span className="deek-eyebrow text-[length:var(--text-caption)] font-medium tracking-[0.01em] text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
        <h1
          className={cn(
            'deek-page-title text-[length:var(--text-title1)] font-semibold tracking-[-0.025em] text-foreground',
            eyebrow ? 'mt-1' : 'mt-0',
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="deek-page-desc mt-2 max-w-2xl text-[length:var(--text-body)] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="deek-page-actions flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

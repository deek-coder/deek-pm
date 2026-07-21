import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <span className="text-sm font-medium text-muted-foreground">{eyebrow}</span>}
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  )
}

import type { ReactNode } from 'react'
import { cn } from '../../shared/cn'
import { PageHeader } from './PageHeader'

interface PageFrameProps {
  eyebrow?: string
  title?: string
  description?: string
  actions?: ReactNode
  /** Optional toolbar under the title (filters, view toggles) */
  toolbar?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  /** Use full content width without the readable max band */
  fullBleed?: boolean
}

/**
 * Standard in-window page frame following macOS window content patterns:
 * title area → optional toolbar → scrollable content with scaled margins.
 */
export function PageFrame({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  children,
  className,
  contentClassName,
  fullBleed = false,
}: PageFrameProps) {
  return (
    <main className={cn('deek-page-frame deek-app-bg h-full min-h-0 overflow-auto', className)}>
      <div className={cn('deek-page-band mx-auto w-full', fullBleed ? 'max-w-none' : 'max-w-[var(--page-max-w)]')}>
        {title ? (
          <PageHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            actions={actions}
            className="deek-page-frame-header"
          />
        ) : null}
        {toolbar ? <div className="deek-page-toolbar mt-4">{toolbar}</div> : null}
        <div className={cn('deek-page-body', title || toolbar ? 'mt-5' : '', contentClassName)}>{children}</div>
      </div>
    </main>
  )
}

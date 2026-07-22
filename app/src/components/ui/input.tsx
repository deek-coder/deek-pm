import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-[var(--control-h)] w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)]',
        'bg-[var(--input-bg)] px-2.5 text-[length:var(--text-body)] text-foreground',
        'shadow-[var(--glass-highlight)] outline-none transition-colors',
        'placeholder:text-muted-foreground/80',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
        'file:mr-2 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[length:var(--text-callout)] file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

export { Input }

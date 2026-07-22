import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content max-h-[min(24rem,50dvh)] min-h-16 w-full overflow-auto',
        'rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input-bg)]',
        'px-2.5 py-2 text-[length:var(--text-body)] text-foreground shadow-[var(--glass-highlight)]',
        'outline-none transition-colors placeholder:text-muted-foreground/80',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }

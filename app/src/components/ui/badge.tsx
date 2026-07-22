import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  [
    'group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden',
    'whitespace-nowrap transition-colors select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    '[&>svg]:pointer-events-none [&>svg]:size-3',
  ].join(' '),
  {
    variants: {
      variant: {
        /** Soft tint pill — status like “使用中” */
        default:
          'h-7 rounded-full border-0 bg-[var(--badge-default-bg)] px-2.5 text-[length:var(--text-caption)] font-medium text-[var(--badge-default-fg)]',
        /** Quiet secondary chip */
        secondary:
          'h-7 rounded-full border-0 bg-[var(--badge-secondary-bg)] px-2.5 text-[length:var(--text-caption)] font-medium text-[var(--badge-secondary-fg)]',
        /** Trailing metadata — almost no chrome (mac secondary label) */
        outline:
          'h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[length:var(--text-body)] font-normal text-muted-foreground',
        /** Project/category tag */
        tag:
          'h-7 rounded-md border border-[var(--badge-tag-border)] bg-[var(--badge-tag-bg)] px-2.5 text-[length:var(--text-caption)] font-medium text-[var(--badge-tag-fg)]',
        /** Destructive soft */
        destructive:
          'h-7 rounded-full border-0 bg-destructive/10 px-2.5 text-[length:var(--text-caption)] font-medium text-destructive',
        ghost: 'h-7 rounded-full border-0 bg-transparent px-2 text-[length:var(--text-caption)] text-muted-foreground',
        link: 'h-auto border-0 bg-transparent p-0 text-[length:var(--text-body)] text-primary underline-offset-2 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant ?? 'default'}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

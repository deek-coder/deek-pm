import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'group/button inline-flex shrink-0 items-center justify-center border border-transparent',
    'bg-clip-padding whitespace-nowrap outline-none select-none',
    'rounded-[var(--radius-control)] text-[length:var(--text-body)] font-medium tracking-[-0.01em]',
    'shadow-[var(--shadow-control)] transition-all duration-[var(--motion-fast)]',
    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
    'active:not-aria-[haspopup]:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-[1.05rem]',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-[var(--button-border)] bg-[image:var(--button-primary-bg)] text-[var(--button-primary-fg)] backdrop-blur-[var(--glass-blur)] hover:brightness-[var(--button-primary-hover-brightness,1.05)]',
        outline:
          'border-[var(--button-border)] bg-[var(--button-bg)] text-foreground backdrop-blur-[var(--glass-blur)] hover:bg-[var(--button-hover-bg)]',
        secondary:
          'border-[var(--button-border)] bg-secondary/80 text-secondary-foreground backdrop-blur-[var(--glass-blur)] hover:bg-secondary',
        ghost:
          'shadow-none hover:bg-[var(--nav-item-hover-bg)] hover:text-foreground',
        destructive:
          'border-transparent bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15',
        link: 'shadow-none text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[var(--control-h)] gap-1.5 px-3',
        xs: 'h-6 gap-1 px-2 text-[length:var(--text-caption)] [&_svg:not([class*=\'size-\'])]:size-3',
        sm: 'h-7 gap-1 px-2.5 text-[length:var(--text-callout)] [&_svg:not([class*=\'size-\'])]:size-3.5',
        lg: 'h-9 gap-1.5 px-3.5',
        icon: 'size-[var(--control-h)]',
        'icon-xs': 'size-6 [&_svg:not([class*=\'size-\'])]:size-3',
        'icon-sm': 'size-7 [&_svg:not([class*=\'size-\'])]:size-3.5',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

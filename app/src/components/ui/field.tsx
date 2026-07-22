import type { InputHTMLAttributes } from 'react'
import { Input } from './input'
import { Label } from './label'
import { cn } from '@/lib/utils'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function TextInput({ className, label, ...props }: TextInputProps) {
  const input = <Input className={className} {...props} />

  if (!label) return input

  return (
    <label className={cn('deek-field grid gap-1.5')}>
      <Label className="text-[length:var(--text-caption)] font-medium text-muted-foreground">{label}</Label>
      {input}
    </label>
  )
}

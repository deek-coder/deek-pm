import type { InputHTMLAttributes } from 'react'
import { Input } from './input'
import { Label } from './label'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function TextInput({ className, label, ...props }: TextInputProps) {
  const input = <Input className={className} {...props} />

  if (!label) return input

  return (
    <label className="grid gap-2">
      <Label>{label}</Label>
      {input}
    </label>
  )
}

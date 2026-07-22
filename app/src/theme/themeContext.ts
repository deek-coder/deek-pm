import { createContext, useContext } from 'react'
import type { AppThemeId, AppThemeOption } from './theme'

export interface ThemeContextValue {
  theme: AppThemeId
  themes: AppThemeOption[]
  setTheme: (theme: AppThemeId) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}

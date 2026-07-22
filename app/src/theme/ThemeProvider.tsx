import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  persistTheme,
  readStoredTheme,
  THEME_OPTIONS,
  type AppThemeId,
} from './theme'
import { ThemeContext } from './themeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME
    const stored = readStoredTheme()
    applyThemeToDocument(stored)
    return stored
  })

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  const setTheme = useCallback((next: AppThemeId) => {
    setThemeState(next)
    persistTheme(next)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      themes: THEME_OPTIONS,
      setTheme,
    }),
    [setTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

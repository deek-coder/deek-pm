export type AppThemeId = 'glass' | 'macos'

export interface AppThemeOption {
  id: AppThemeId
  name: string
  description: string
  preview: {
    background: string
    surface: string
    accent: string
    text: string
  }
}

export const THEME_STORAGE_KEY = 'deek-pm.theme.v1'
export const DEFAULT_THEME: AppThemeId = 'glass'

export const THEME_OPTIONS: AppThemeOption[] = [
  {
    id: 'glass',
    name: 'Deek Glass',
    description: '当前默认主题：冷灰蓝毛玻璃、轻阴影与渐变卡片。',
    preview: {
      background: 'oklch(0.945 0.012 255)',
      surface: 'oklch(0.99 0.004 255 / 86%)',
      accent: 'oklch(0.55 0.08 255)',
      text: 'oklch(0.22 0.03 255)',
    },
  },
  {
    id: 'macos',
    name: 'macOS System',
    description: '贴近最新 macOS 系统观感：系统蓝、SF 字体栈、Liquid Glass 材质分层。',
    preview: {
      background: 'oklch(0.96 0.004 250)',
      surface: 'oklch(0.995 0.002 250 / 72%)',
      accent: 'oklch(0.58 0.19 250)',
      text: 'oklch(0.2 0.02 255)',
    },
  },
]

export function isAppThemeId(value: unknown): value is AppThemeId {
  return value === 'glass' || value === 'macos'
}

export function readStoredTheme(): AppThemeId {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isAppThemeId(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyThemeToDocument(theme: AppThemeId) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = 'light'
}

export function persistTheme(theme: AppThemeId) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyThemeToDocument(theme)
}

export type Theme = 'light' | 'dark'
export const THEME_STORAGE_KEY = 'kuroom.theme'

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  return stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light'
}

export function mountThemeToggle(button: HTMLButtonElement) {
  const preference = window.matchMedia('(prefers-color-scheme: dark)')
  let stored: string | null = null
  try { stored = window.localStorage.getItem(THEME_STORAGE_KEY) } catch { /* Storage may be unavailable. */ }
  let explicit = stored === 'light' || stored === 'dark'
  let theme = resolveTheme(stored, preference.matches)

  function apply(value: Theme) {
    theme = value
    document.documentElement.dataset.theme = value
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#181818' : '#fafafa')
    const label = value === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'
    button.setAttribute('aria-label', label)
    button.title = label
  }

  const toggle = () => {
    explicit = true
    apply(theme === 'light' ? 'dark' : 'light')
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Keep the choice for this visit. */ }
  }
  const systemChange = (event: MediaQueryListEvent) => { if (!explicit) apply(resolveTheme(null, event.matches)) }
  button.addEventListener('click', toggle)
  preference.addEventListener('change', systemChange)
  apply(theme)
  return () => {
    button.removeEventListener('click', toggle)
    preference.removeEventListener('change', systemChange)
  }
}

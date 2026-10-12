// @vitest-environment happy-dom
import html from '../index.html?raw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountThemeToggle, resolveTheme, THEME_STORAGE_KEY } from '../src/theme'

const cases = [
  { stored: 'light', dark: false, expected: 'light' },
  { stored: 'light', dark: true, expected: 'light' },
  { stored: 'dark', dark: false, expected: 'dark' },
  { stored: 'dark', dark: true, expected: 'dark' },
  { stored: null, dark: false, expected: 'light' },
  { stored: null, dark: true, expected: 'dark' },
  { stored: 'invalid', dark: false, expected: 'light' },
  { stored: 'invalid', dark: true, expected: 'dark' },
]
let preference: EventTarget & { matches: boolean }
let button: HTMLButtonElement
let unmount: (() => void) | undefined

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.head.innerHTML = '<meta name="theme-color">'
  document.body.innerHTML = '<button type="button" id="toggle"></button>'
  button = document.querySelector<HTMLButtonElement>('#toggle')!
  preference = Object.assign(new EventTarget(), { matches: false })
  vi.spyOn(window, 'matchMedia').mockReturnValue(preference as unknown as MediaQueryList)
})
afterEach(() => { unmount?.(); unmount = undefined; vi.restoreAllMocks() })

function changeSystem(dark: boolean) {
  preference.matches = dark
  preference.dispatchEvent(Object.assign(new Event('change'), { matches: dark }))
}

describe('theme state, persistence and early HTML bootstrap', () => {
  it.each(cases)('resolves and applies stored=$stored, system dark=$dark → $expected', ({ stored, dark, expected }) => {
    expect(resolveTheme(stored, dark)).toBe(expected)
    if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored)
    preference.matches = dark
    unmount = mountThemeToggle(button)
    expect(document.documentElement.dataset.theme).toBe(expected)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(stored)
    expect(button.getAttribute('aria-label')).toBe(expected === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환')
    expect(button.title).toBe(button.getAttribute('aria-label'))
  })

  it.each(['light', 'dark'] as const)('toggles from %s, persists and ignores later system changes', initial => {
    localStorage.setItem(THEME_STORAGE_KEY, initial)
    unmount = mountThemeToggle(button)
    button.click()
    const next = initial === 'light' ? 'dark' : 'light'
    expect(document.documentElement.dataset.theme).toBe(next)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(next)
    expect(button.getAttribute('aria-label')).toBe(initial === 'dark' ? '다크 테마로 전환' : '라이트 테마로 전환')
    changeSystem(initial === 'dark')
    expect(document.documentElement.dataset.theme).toBe(next)
    unmount()
    unmount = mountThemeToggle(button) // A subsequent visit uses the saved choice.
    expect(document.documentElement.dataset.theme).toBe(next)
  })

  it('follows system changes until the first explicit choice', () => {
    unmount = mountThemeToggle(button)
    changeSystem(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    button.click()
    changeSystem(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('continues working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    preference.matches = true
    unmount = mountThemeToggle(button)
    button.click()
    changeSystem(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it.each(cases)('bootstrap agrees before module loading: stored=$stored, dark=$dark', ({ stored, dark, expected }) => {
    const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1]
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'))
    const storage = { getItem: () => stored }
    const environment = { matchMedia: () => ({ matches: dark }) }
    new Function('window', 'localStorage', 'document', bootstrap)(environment, storage, document)
    expect(document.documentElement.dataset.theme).toBe(expected)
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content'))
      .toBe(expected === 'dark' ? '#181818' : '#fafafa')
  })

  it('bootstrap falls back to system preference when storage is blocked', () => {
    const storage = { getItem: () => { throw new Error('blocked') } }
    new Function('window', 'localStorage', 'document', html.match(/<script>([\s\S]*?)<\/script>/)![1])(
      { matchMedia: () => ({ matches: true }) }, storage, document)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

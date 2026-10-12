// @vitest-environment happy-dom
// DOM events and fake timers only; no real browser or GUI automation.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountBuildingQuickNavigation, renderBuildingIndex } from '../src/building-index'

let media: EventTarget & { matches: boolean }
let section: HTMLElement
let controls: HTMLElement
let index: HTMLElement
let list: HTMLElement
let navigation: ReturnType<typeof mountBuildingQuickNavigation>
const rooms = [
  { id: '공B155', building: '공B', number: '155' },
  { id: '새502', building: '새', number: '502' },
]
const visible = () => index.dataset.overlayVisible === 'true'
const scroll = () => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(20) }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  media = Object.assign(new EventTarget(), { matches: true })
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
  document.body.innerHTML = `<div id="controls"></div><section><ul id="results">
    <li data-room-id="공B155"><button class="room-row">공B 155</button></li>
    <li data-room-id="새502"><button class="room-row">새 502</button></li>
    </ul><nav></nav></section>`
  controls = document.querySelector('#controls')!
  section = document.querySelector('section')!
  index = document.querySelector('nav')!
  list = document.querySelector('ul')!
  vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 1400 } as DOMRect)
  vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue({ bottom: 100 } as DOMRect)
  navigation = mountBuildingQuickNavigation(index, section, controls)
  renderBuildingIndex(index, list, rooms, navigation.onNavigate)
})
afterEach(() => { navigation.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren() })

it('starts hidden/inert, reveals on result scroll and hides 1200ms after the last scroll', () => {
  expect(visible()).toBe(false)
  expect(index.inert).toBe(true)
  scroll()
  expect(visible()).toBe(true)
  expect(index.inert).toBe(false)
  vi.advanceTimersByTime(1000)
  scroll()
  vi.advanceTimersByTime(1100)
  expect(visible()).toBe(true)
  vi.advanceTimersByTime(100)
  expect(visible()).toBe(false)
  expect(index.inert).toBe(true)
})

it('coalesces scroll events into one animation frame without rendering or changing URL/results', () => {
  const before = list.innerHTML
  const url = window.location.href
  const geometry = vi.mocked(section.getBoundingClientRect)
  for (let count = 0; count < 20; count++) window.dispatchEvent(new Event('scroll'))
  expect(geometry).not.toHaveBeenCalled()
  vi.advanceTimersByTime(20)
  expect(geometry).toHaveBeenCalledTimes(1)
  expect(list.innerHTML).toBe(before)
  expect(window.location.href).toBe(url)
})

it.each(['outside', 'lookup', 'empty', 'dialog'])('does not reveal outside usable availability results: %s', condition => {
  if (condition === 'outside') vi.mocked(section.getBoundingClientRect).mockReturnValue({ top: -500, bottom: 50 } as DOMRect)
  if (condition === 'lookup') section.hidden = true
  if (condition === 'empty') renderBuildingIndex(index, list, [])
  if (condition === 'dialog') document.body.insertAdjacentHTML('beforeend', '<dialog open></dialog>')
  scroll()
  expect(visible()).toBe(false)
})

it('keeps hovered navigation visible until the pointer leaves, then restarts the hide delay', () => {
  scroll()
  index.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))
  vi.advanceTimersByTime(5000)
  expect(visible()).toBe(true)
  index.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
  vi.advanceTimersByTime(1200)
  expect(visible()).toBe(false)
})

it('keeps touch/drag interaction visible until release or cancellation, including outside the rail', () => {
  scroll()
  index.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }))
  index.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1 }))
  vi.advanceTimersByTime(5000)
  expect(visible()).toBe(true)
  window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', pointerId: 1 }))
  vi.advanceTimersByTime(1200)
  expect(visible()).toBe(false)
})

it('keeps focus inside visible and hides only after focus leaves', async () => {
  scroll()
  index.querySelector('button')!.focus()
  vi.advanceTimersByTime(5000)
  expect(visible()).toBe(true)
  list.querySelector('button')!.focus()
  await Promise.resolve()
  vi.advanceTimersByTime(1200)
  expect(visible()).toBe(false)
})

it('navigates to the first room, moves focus without extra scroll, then hides after selection', async () => {
  scroll()
  const row = list.children[1] as HTMLElement
  const move = vi.spyOn(row, 'scrollIntoView').mockImplementation(() => {})
  const before = list.innerHTML
  const url = window.location.href
  const button = index.children[1] as HTMLButtonElement
  button.focus()
  button.click()
  await Promise.resolve()
  expect(move).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
  expect(document.activeElement).toBe(row.querySelector('button'))
  expect(list.innerHTML).toBe(before)
  expect(window.location.href).toBe(url)
  expect(visible()).toBe(true)
  vi.advanceTimersByTime(1200)
  expect(visible()).toBe(false)
})

it('leaves desktop navigation non-inert and unaffected by auto-hide state', () => {
  media.matches = false
  media.dispatchEvent(new Event('change'))
  scroll()
  vi.advanceTimersByTime(5000)
  expect(index.inert).toBe(false)
  expect(index.hidden).toBe(false)
  expect(index.children).toHaveLength(2)
  media.matches = true
  media.dispatchEvent(new Event('change'))
  expect(index.inert).toBe(true)
  expect(visible()).toBe(false)
})

it('reset and cleanup cancel pending scroll frames and hide timers', () => {
  window.dispatchEvent(new Event('scroll'))
  navigation.reset()
  vi.advanceTimersByTime(20)
  expect(visible()).toBe(false)
  scroll()
  navigation.destroy()
  window.dispatchEvent(new Event('scroll'))
  vi.advanceTimersByTime(5000)
  expect(visible()).toBe(false)
})

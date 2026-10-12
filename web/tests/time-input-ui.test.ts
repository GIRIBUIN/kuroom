// @vitest-environment happy-dom
// Native DOM event contracts only; no real browser or GUI automation.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { mountTimeInput } from '../src/time-input-ui'

let hour: HTMLInputElement
let minute: HTMLInputElement
let commit: Mock<(value: string | null) => void>
let control: ReturnType<typeof mountTimeInput>
const edit = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
}
const key = (input: HTMLInputElement, value: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })
  input.dispatchEvent(event)
  return event
}
const paste = (input: HTMLInputElement, value: string) => {
  const clipboardData = new DataTransfer()
  clipboardData.setData('text', value)
  const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.innerHTML = `<div id="time"><input id="time-hour" type="text" inputmode="numeric" maxlength="2" aria-label="시">
    <span aria-hidden="true">:</span><input id="time-minute" type="text" inputmode="numeric" maxlength="2" aria-label="분"></div><button>다음</button>`
  hour = document.querySelector('#time-hour')!
  minute = document.querySelector('#time-minute')!
  commit = vi.fn()
  control = mountTimeInput(document.querySelector('#time')!, commit)
  control.setValue('09:00')
})
afterEach(() => document.body.replaceChildren())

it('advances from two hour digits to the selected minute segment and commits 09:30 on Enter', () => {
  hour.focus()
  edit(hour, '0')
  expect(document.activeElement).toBe(hour)
  edit(hour, '09')
  expect(document.activeElement).toBe(minute)
  expect(minute.selectionStart).toBe(0)
  expect(minute.selectionEnd).toBe(2)
  expect(commit).not.toHaveBeenCalled()
  edit(minute, '30')
  expect(key(minute, 'Enter').defaultPrevented).toBe(true)
  expect(commit).toHaveBeenLastCalledWith('09:30')
  expect([hour.value, minute.value]).toEqual(['09', '30'])
})

it.each(['0930', '09:30', '9:30', '-930', 'ab09:30'])('distributes sanitized paste %s and commits the canonical value', value => {
  hour.focus()
  expect(paste(hour, value).defaultPrevented).toBe(true)
  expect([hour.value, minute.value]).toEqual(['09', '30'])
  expect(commit).toHaveBeenLastCalledWith('09:30')
  expect(document.activeElement).toBe(minute)
})

it('supports pasting a minute alone and ignores paste without digits', () => {
  paste(minute, '45')
  expect(commit).toHaveBeenLastCalledWith('09:45')
  commit.mockClear()
  paste(hour, 'abc')
  expect(commit).not.toHaveBeenCalled()
  expect([hour.value, minute.value]).toEqual(['09', '45'])
})

it.each(['-', '+', 'e', '.', ':', '한'])('blocks direct nondigit keyboard input %s', value => {
  expect(key(hour, value).defaultPrevented).toBe(true)
  const event = new InputEvent('beforeinput', { data: value, inputType: 'insertText', cancelable: true })
  hour.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})

it('sanitizes fallback input events and limits both segments to two digits', () => {
  edit(hour, '-+e.1:')
  expect(hour.value).toBe('1')
  edit(minute, '3한0abc9')
  expect(minute.value).toBe('30')
})

it('keeps native digits, navigation, Tab and Shift+Tab behavior', () => {
  for (const value of ['0', '9', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace']) {
    expect(key(hour, value).defaultPrevented).toBe(false)
  }
  expect(key(hour, 'Tab', { shiftKey: true }).defaultPrevented).toBe(false)
  expect(key(hour, 'a', { ctrlKey: true }).defaultPrevented).toBe(false)
})

it('moves empty-minute Backspace to hours without deleting a digit', () => {
  minute.focus()
  minute.value = ''
  expect(key(minute, 'Backspace').defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(hour)
  expect(hour.value).toBe('09')
})

it('commits partial hours on external blur, without committing internal segment focus changes', () => {
  control.setValue('')
  hour.focus()
  edit(hour, '9')
  minute.focus()
  expect(commit).not.toHaveBeenCalled()
  document.querySelector('button')!.focus()
  expect(commit).toHaveBeenLastCalledWith('09:00')
  expect([hour.value, minute.value]).toEqual(['09', '00'])
})

it('leaves empty input empty rather than creating midnight', () => {
  control.setValue('')
  key(minute, 'Enter')
  expect(commit).toHaveBeenLastCalledWith(null)
  expect([hour.value, minute.value]).toEqual(['', ''])
  expect(hour.getAttribute('aria-invalid')).toBe('true')
})

it('independently corrects range overflow and clears invalid state on external updates', () => {
  hour.value = '29'
  minute.value = '99'
  key(minute, 'Enter')
  expect(commit).toHaveBeenLastCalledWith('00:59')
  expect([hour.value, minute.value]).toEqual(['00', '59'])
  control.setValue('23:57')
  expect([hour.value, minute.value]).toEqual(['23', '57'])
  expect(hour.hasAttribute('aria-invalid')).toBe(false)
})

it('does not move focus or commit during IME composition and sanitizes after composition ends', () => {
  hour.focus()
  hour.dispatchEvent(new CompositionEvent('compositionstart'))
  edit(hour, '한')
  expect(hour.value).toBe('한')
  expect(document.activeElement).toBe(hour)
  expect(key(hour, 'Enter', { isComposing: true }).defaultPrevented).toBe(false)
  expect(commit).not.toHaveBeenCalled()
  hour.dispatchEvent(new CompositionEvent('compositionend'))
  expect(hour.value).toBe('')
  expect(document.activeElement).toBe(hour)
  expect(key(hour, 'Enter', { keyCode: 229 }).defaultPrevented).toBe(false)
})

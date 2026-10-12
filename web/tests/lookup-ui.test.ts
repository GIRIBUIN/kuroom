// @vitest-environment happy-dom
// DOM unit tests only: no browser process, automation, or GUI is used.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import type { Room, Schedule } from '../src/data'

const rooms: Room[] = [
  { id: '공B155', building: '공B', number: '155' },
  { id: '공B156', building: '공B', number: '156' },
  { id: '경영206', building: '경영', number: '206' },
  { id: '새502', building: '새', number: '502' },
]
const schedules: Schedule[] = [
  { room: '공B155', day: '월', start_period: 1, end_period: 3, subject_name: '자료구조', professor: '김교수' },
  { room: '공B156', day: '월', start_period: 2, end_period: 2, subject_name: '운영체제' },
]
const get = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const input = () => get<HTMLInputElement>('#lookup-input')
const action = () => get<HTMLButtonElement>('#lookup-action')
const typeQuery = (query: string) => {
  input().value = query
  input().dispatchEvent(new Event('input', { bubbles: true }))
}
const press = (target: EventTarget, key: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  target.dispatchEvent(event)
  return event
}
const choose = (text: string) => {
  const option = Array.from(get('#lookup-options').children).find(option => option.textContent?.includes(text))
  expect(option).toBeDefined()
  ;(option as HTMLElement).click()
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T00:00:00Z')) // Monday 09:00 in Seoul.
  document.body.innerHTML = '<div id="app"></div>'
  // A DOM emulator cannot model native modal behavior. Stub that boundary;
  // assertions below cover our wiring, content and dialog reuse.
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  })
  vi.doMock('../src/data', async () => ({
    ...await vi.importActual<typeof import('../src/data')>('../src/data'),
    loadReleaseData: async () => ({ rooms, schedules, manifest: { timezone: 'Asia/Seoul' } }),
  }))
  await import('../src/main')
  await vi.waitFor(() => expect(get<HTMLFieldSetElement>('#filters').disabled).toBe(false))
})

afterEach(() => {
  const dialog = get<HTMLDialogElement>('dialog')
  if (dialog.open) dialog.close()
  action().click()
  get<HTMLButtonElement>('#all-buildings').click()
  get<HTMLSelectElement>('#day').value = '월'
  get<HTMLInputElement>('#time').value = '09:00'
  get<HTMLSelectElement>('#min').value = '60'
  get('#time').dispatchEvent(new Event('input', { bubbles: true }))
  action().focus()
})

afterAll(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.doUnmock('../src/data')
})

describe('lookup UI and keyboard wiring without a browser', () => {
  it.each([320, 390, 420, 421, 769, 900, 901])('keeps compact navigation out of layout and fills the filter grid (%ipx)', width => {
    // Evaluate CSS/class contracts only in a DOM emulator. This does not
    // measure rendered geometry or launch/control a real browser.
    const dom = new Window({ width, height: 900 })
    const style = dom.document.createElement('style')
    style.textContent = readFileSync('src/style.css', 'utf8')
    dom.document.head.append(style)
    dom.document.body.innerHTML = get('.app').outerHTML
    const computed = (selector: string) => dom.getComputedStyle(dom.document.querySelector(selector)!)
    const compact = width <= 900
    expect(computed('#building-index').display).toBe('flex')
    expect(computed('#availability-results .room-row').alignItems).toBe('center')
    expect(computed('#availability-results .room-row').flexDirection).not.toBe('column')
    if (compact) {
      expect(computed('.availability-body.has-index').gridTemplateColumns).toBe('minmax(0, 1fr)')
      expect(computed('#building-index').position).toBe('fixed')
      expect(computed('#building-index').visibility).toBe('hidden')
      const rail = dom.document.querySelector('#building-index')!
      rail.setAttribute('data-overlay-visible', 'true')
      expect(computed('#building-index').visibility).toBe('visible')
      expect(computed('#building-index').pointerEvents).toBe('auto')
      expect(computed('.availability-body.has-index').gridTemplateColumns).toBe('minmax(0, 1fr)')
      expect(computed('#building-index button').minHeight).toBe('44px')
      expect(computed('#availability-results .room-row').flexWrap).toBe('wrap')
      expect(computed('#availability-results .room-row').minHeight).toBe('56px')
      expect(computed('#availability-results .room-info').alignItems).toBe('flex-end')
      expect(computed('#availability-results .room-row').paddingTop).toBe('12px')
      expect(computed('#availability-results .room-name').fontSize).toBe('16px')
      expect(computed('#availability-results .room-duration').fontSize).toBe('14px')
      expect(computed('#filters').display).toBe('grid')
      expect(computed('#filters').width).toBe('100%')
      expect(computed('#filters').paddingLeft).toBe('0px')
      expect(computed('#filters').paddingRight).toBe('0px')
      expect(computed('#filters').gridTemplateColumns.match(/minmax/g)).toHaveLength(width <= 420 ? 2 : 4)
      expect(computed('.time-controls').display).toBe('contents')
      if (width <= 420) expect(computed('.building-field').gridColumn).toBe('2 / -1')
      for (const control of ['#day', '#time', '#now', '#min', '#building-picker summary']) {
        expect(computed(control).height).toBe('36px')
        expect(computed(control).fontSize).toBe('16px')
      }
      expect(computed('.lookup-entry').maxHeight).toBe('68px')
    } else {
      expect(computed('.availability-body.has-index').gridTemplateColumns).toContain('64px')
      expect(computed('#building-index').position).toBe('sticky')
    }
    expect(computed('.sticky-controls').position).toBe('sticky')
    const row = dom.document.querySelector('#results .room-row')!
    expect(row.tagName).toBe('BUTTON')
    expect(row.children[0].className).toBe('room-name')
    expect(row.children[1].querySelector('.room-duration')).not.toBeNull()
    expect(row.textContent).not.toContain('다음 수업')
    dom.close()
  })

  it('keeps the small accessible theme button in the non-sticky header', () => {
    const toggle = get<HTMLButtonElement>('.page-header #theme-toggle')
    expect(toggle.type).toBe('button')
    expect(toggle.getAttribute('aria-label')).toMatch(/테마로 전환$/)
    expect(toggle.title).toBe(toggle.getAttribute('aria-label'))
    expect(get('.sticky-controls').contains(toggle)).toBe(false)
  })

  it('renders room plus duration without next-class text in availability rows', () => {
    expect(get('#results').children.length).toBeGreaterThan(0)
    expect(get('#results').querySelector('.room-next')).toBeNull()
    expect(get('#results').textContent).not.toContain('다음 수업')
    expect(get('#results').textContent).toContain('제한 없음')
    get<HTMLButtonElement>('#results button').click()
    expect(get('.detail-next').textContent).toContain('주간 수업 없음')
  })

  it('guarantees 24-hour HH:mm entry and context independently of browser locale', () => {
    const time = get<HTMLInputElement>('#time')
    expect(time.type).toBe('text')
    expect(time.title).toContain('24시간')
    expect(time.value).toBe('09:00')
    for (const value of ['09:00', '13:30', '22:20', '00:00', '23:59']) {
      time.value = value
      time.dispatchEvent(new Event('input', { bubbles: true }))
      expect(get('#result-context').textContent).toBe(`월요일 · ${value} 기준`)
      expect(time.hasAttribute('aria-invalid')).toBe(false)
    }
    time.value = '10:20 PM'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    expect(time.getAttribute('aria-invalid')).toBe('true')
    get<HTMLButtonElement>('#now').click()
    expect(time.value).toBe('09:00')
    expect(time.hasAttribute('aria-invalid')).toBe(false)
  })

  it('marks exact autocomplete matches visually without changing candidate selection', () => {
    typeQuery(' 공b 155 ')
    expect(get('#lookup-option-0').dataset.exact).toBe('true')
    typeQuery('공')
    expect(Array.from(get('#lookup-options').children).every(option => (option as HTMLElement).dataset.exact === 'false')).toBe(true)
  })

  it('always shows search, preserves availability while empty, and clears query plus tokens with X', () => {
    expect(document.querySelector('#lookup-toggle')).toBeNull()
    expect(get('#lookup-panel').hidden).toBe(false)
    expect(action().dataset.clear).toBe('false')
    action().click()
    expect(document.activeElement).toBe(input())
    expect(get('.filter-panel').hidden).toBe(false)
    expect(get('#availability-results').hidden).toBe(false)
    expect(get('#lookup-results').hidden).toBe(true)
    typeQuery('공B')
    expect(get('.filter-panel').hidden).toBe(true)
    expect(get('#availability-results').hidden).toBe(true)
    expect(get('#lookup-results').hidden).toBe(false)
    expect(get('#lookup-heading').textContent).toBe('검색 결과 2개')
    expect(get('#lookup-rooms').querySelector('.room-duration')).toBeNull()
    choose('2개 강의실')
    typeQuery('새502')
    expect(get('#lookup-tokens').children).toHaveLength(1)
    expect(action().dataset.clear).toBe('true')
    action().click()
    expect(input().value).toBe('')
    expect(get('#lookup-tokens').children).toHaveLength(0)
    expect(get('#lookup-options').hidden).toBe(true)
    expect(action().dataset.clear).toBe('false')
    expect(get('.filter-panel').hidden).toBe(false)
    expect(get('#availability-results').hidden).toBe(false)
    expect(get('#lookup-panel').hidden).toBe(false)
  })

  it('Q focuses the existing input; modified shortcuts and IME composition are left alone', () => {
    expect(press(document, 'q', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press(document, 'q', { isComposing: true }).defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(action())
    expect(press(document, 'Q').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input())
    expect(get('#lookup-panel').hidden).toBe(false)
    expect(press(input(), 'q').defaultPrevented).toBe(false)
  })

  it.each(['input', 'textarea', 'select', 'contenteditable'])('does not intercept Q in %s', kind => {
    const control = document.createElement(kind === 'contenteditable' ? 'div' : kind)
    if (kind === 'contenteditable') {
      control.setAttribute('contenteditable', 'true')
      control.tabIndex = 0
    }
    document.body.append(control)
    control.focus()
    expect(press(control, 'q').defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(control)
    expect(get('#lookup-panel').hidden).toBe(false)
    control.remove()
  })

  it('supports ArrowDown/ArrowUp and Enter via an active descendant, without moving DOM focus', () => {
    input().focus()
    typeQuery('공B')
    expect(input().getAttribute('aria-expanded')).toBe('true')
    press(input(), 'ArrowDown')
    expect(input().getAttribute('aria-activedescendant')).toBe('lookup-option-0')
    press(input(), 'ArrowDown')
    expect(input().getAttribute('aria-activedescendant')).toBe('lookup-option-1')
    press(input(), 'ArrowUp')
    expect(input().getAttribute('aria-activedescendant')).toBe('lookup-option-0')
    press(input(), 'Enter', { isComposing: true })
    expect(get('#lookup-tokens').children).toHaveLength(0)
    press(input(), 'Enter')
    expect(get('#lookup-tokens').textContent).toBe('건물: 공B×')
    expect(input().value).toBe('')
    expect(document.activeElement).toBe(input())
    expect(get('.filter-panel').hidden).toBe(true)
    expect(get('#lookup-heading').textContent).toBe('검색 결과 2개')
  })

  it('Escape closes autocomplete first and never closes search or resets query/tokens', () => {
    input().focus()
    typeQuery('공B')
    press(input(), 'Escape')
    expect(get('#lookup-options').hidden).toBe(true)
    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(get('#lookup-panel').hidden).toBe(false)
    expect(input().value).toBe('공B')
    press(input(), 'Escape')
    expect(get('#lookup-panel').hidden).toBe(false)
    typeQuery('')
    expect(press(input(), 'Escape').defaultPrevented).toBe(false)
    expect(get('#lookup-panel').hidden).toBe(false)
    expect(document.activeElement).toBe(input())
  })

  it('selects by mouse, keeps multiple OR tokens, rejects duplicates and deletes tokens individually', () => {
    input().focus()
    typeQuery('공B')
    choose('2개 강의실')
    typeQuery('경영206')
    choose('경영 206')
    expect(get('#lookup-heading').textContent).toBe('검색 결과 3개')
    typeQuery('경영206')
    expect(get('#lookup-options').children).toHaveLength(0)
    typeQuery('')
    press(input(), 'Escape')
    expect(get('#lookup-panel').hidden).toBe(false)
    get<HTMLButtonElement>('[aria-label="건물: 공B 삭제"]').click()
    expect(get('#lookup-heading').textContent).toBe('검색 결과 1개')
    get<HTMLButtonElement>('[aria-label="경영 206 삭제"]').click()
    expect(get('#lookup-tokens').children).toHaveLength(0)
    expect(get('.filter-panel').hidden).toBe(false)
    expect(document.activeElement).toBe(input())
  })

  it('closes suggestions on focus leaving search and reopens them with an arrow', () => {
    input().focus()
    typeQuery('공B')
    get('#day').focus()
    expect(get('#lookup-options').hidden).toBe(true)
    input().focus()
    press(input(), 'Escape')
    press(input(), 'ArrowUp')
    expect(input().getAttribute('aria-activedescendant')).toBe('lookup-option-2')
  })

  it('reuses the same dialog for availability and for occupied or minimum-excluded lookup rooms', () => {
    const dialog = get<HTMLDialogElement>('dialog')
    expect(get('#results').textContent).not.toContain('공B 155')
    expect(get('#results').textContent).not.toContain('공B 156')
    get<HTMLButtonElement>('#results button').click()
    expect(dialog.open).toBe(true)
    dialog.close()
    // A different availability day/time/building must not restrict lookup or
    // determine its "current" state; lookup detail uses the actual instant.
    get<HTMLSelectElement>('#day').value = '화'
    get<HTMLInputElement>('#time').value = '15:00'
    const building = get<HTMLInputElement>('#building-options input[value="경영"]')
    building.checked = true
    building.dispatchEvent(new Event('input', { bubbles: true }))
    expect(get('#results').textContent).not.toContain('공B')
    input().focus()
    typeQuery('공B155')
    get<HTMLButtonElement>('#lookup-rooms button').click()
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(dialog.open).toBe(true)
    expect(get('#room-title').textContent).toBe('공B 155')
    expect(get('.detail-context').textContent).toBe('월요일 09:00 기준')
    expect(get('.detail-duration').textContent).toBe('수업 중')
    expect(get('.detail-next').textContent).toBe('10:30 종료')
    expect(get('.course-subject').textContent).toBe('자료구조')
    expect(get('.course-professor').textContent).toBe('김교수')
    get<HTMLButtonElement>('.close-dialog').focus()
    expect(press(document, 'q').defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(get('.close-dialog'))
    get<HTMLButtonElement>('.close-dialog').click()
    typeQuery('공B156')
    get<HTMLButtonElement>('#lookup-rooms button').click()
    expect(get('#room-title').textContent).toBe('공B 156')
    expect(get('.detail-duration').textContent).toBe('30분')
  })

  it('renders no disclaimer or empty-time placeholder; empty grid columns remain blank', () => {
    expect(document.body.textContent).not.toContain('정규 시간표 기준입니다. 행사·대관·건물 개방 여부는 반영하지 않습니다.')
    expect(document.querySelector('.page-footer')).toBeNull()
    get<HTMLButtonElement>('#results button').click()
    expect(document.querySelector('.no-class')).toBeNull()
    expect(document.querySelectorAll('.timetable-column')).toHaveLength(5)
    for (const column of document.querySelectorAll('.timetable-column')) expect(column.textContent).toBe('')
  })

  it.each([
    { query: '공B155', key: ',', label: '공B 155×' },
    { query: '공B', key: ',', label: '건물: 공B×' },
    { query: '공B155', key: 'Enter', label: '공B 155×' },
    { query: '공B', key: 'Enter', label: '건물: 공B×' },
  ])('confirms a unique exact match with $key: $query', ({ query, key, label }) => {
    input().focus()
    typeQuery(query)
    expect(press(input(), key).defaultPrevented).toBe(true)
    expect(get('#lookup-tokens').textContent).toBe(label)
    expect(input().value).toBe('')
  })

  it('confirms an explicitly arrow-selected partial match with comma', () => {
    input().focus()
    typeQuery('공')
    press(input(), 'ArrowDown')
    press(input(), 'ArrowDown')
    expect(get('#lookup-option-1').getAttribute('aria-selected')).toBe('true')
    press(input(), ',')
    expect(get('#lookup-tokens').textContent).toBe('공B 155×')
    expect(input().value).toBe('')
  })

  it.each(['공', '없는방'])('keeps ambiguous or unmatched query without arbitrarily selecting a token: %s', query => {
    input().focus()
    typeQuery(query)
    for (const key of [',', 'Enter']) {
      expect(press(input(), key).defaultPrevented).toBe(true)
      expect(get('#lookup-tokens').children).toHaveLength(0)
      expect(input().value).toBe(query)
    }
    if (query === '공') expect(get('#lookup-options').hidden).toBe(false)
  })

  it('tokenizes comma-separated paste and input events without leaving commas or duplicate tokens', () => {
    input().focus()
    typeQuery('공B, 경영206, 새502, 공B,')
    expect(get('#lookup-tokens').textContent).toBe('건물: 공B×경영 206×새 502×')
    expect(input().value).toBe('')
    expect(get('#lookup-heading').textContent).toBe('검색 결과 4개')
    typeQuery('공, 없는방,')
    expect(input().value).toBe('공 없는방')
    expect(input().value).not.toContain(',')
    expect(get('#lookup-tokens').children).toHaveLength(3)
  })

  it('handles a comma delivered as an input event for the explicitly selected candidate', () => {
    input().focus()
    typeQuery('공')
    press(input(), 'ArrowDown')
    press(input(), 'ArrowDown')
    typeQuery('공,')
    expect(get('#lookup-tokens').textContent).toBe('공B 155×')
  })

  it('does not confirm delimiters or delete tokens during IME composition', () => {
    input().focus()
    typeQuery('공B')
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    for (const key of [',', 'Enter', 'Backspace']) expect(press(input(), key).defaultPrevented).toBe(false)
    input().value = '공B,'
    input().dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }))
    expect(input().value).toBe('공B,')
    expect(get('#lookup-tokens').children).toHaveLength(0)
    input().value = '공B'
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    expect(get('#lookup-tokens').children).toHaveLength(0)
    expect(press(input(), ',', { keyCode: 229 }).defaultPrevented).toBe(false)
    press(input(), ',')
    expect(get('#lookup-tokens').children).toHaveLength(1)
  })

  it('Backspace removes only the last token when the query is completely empty', () => {
    input().focus()
    typeQuery('공B, 경영206,')
    expect(press(input(), 'Backspace').defaultPrevented).toBe(true)
    expect(get('#lookup-tokens').textContent).toBe('건물: 공B×')
    expect(input().value).toBe('')
    typeQuery('새')
    expect(press(input(), 'Backspace').defaultPrevented).toBe(false)
    expect(get('#lookup-tokens').children).toHaveLength(1)
    typeQuery('')
    press(input(), 'Backspace')
    expect(get('.filter-panel').hidden).toBe(false)
    expect(press(input(), 'Backspace').defaultPrevented).toBe(false)
  })

  it('places only search and filters in the sticky wrapper, and keeps full plain results without pagination', () => {
    expect(get('.sticky-controls').contains(input())).toBe(true)
    expect(get('.sticky-controls').contains(get('.filter-panel'))).toBe(true)
    expect(get('.sticky-controls').contains(get('.page-header'))).toBe(false)
    const before = get('#results').innerHTML
    typeQuery('공')
    expect(get('.filter-panel').hidden).toBe(true)
    expect(get('#availability-results').hidden).toBe(true)
    action().click()
    expect(get('#results').innerHTML).toBe(before)
    expect(document.querySelector('[aria-label*="페이지"], .pagination, [data-page]')).toBeNull()
    expect(get('#results').children).toHaveLength(2)
    for (const row of get('#results').children) expect(row.querySelector('.room-row')).not.toBeNull()
  })

  it('indexes only the current availability buildings in result order, scrolls to the first row and preserves results/URL', () => {
    // Min 0 includes the free-for-30-minutes room but still excludes the occupied room.
    const minimum = document.createElement('option')
    minimum.value = '0'
    minimum.textContent = '0분'
    get<HTMLSelectElement>('#min').add(minimum)
    get<HTMLSelectElement>('#min').value = '0'
    get('#min').dispatchEvent(new Event('input', { bubbles: true }))
    const rail = get('#building-index')
    expect(Array.from(rail.children, button => button.textContent)).toEqual(['경영', '공B', '새'])
    const first = get<HTMLElement>('#results li[data-room-id="공B156"]')
    const scroll = vi.spyOn(first, 'scrollIntoView').mockImplementation(() => {})
    const before = get('#results').innerHTML
    const url = window.location.href
    get<HTMLButtonElement>('#building-index [aria-label="공B 첫 강의실로 이동"]').click()
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
    expect(get('#results').innerHTML).toBe(before)
    expect(window.location.href).toBe(url)
    scroll.mockRestore()
    const building = get<HTMLInputElement>('#building-options input[value="경영"]')
    building.checked = true
    building.dispatchEvent(new Event('input', { bubbles: true }))
    expect(Array.from(rail.children, button => button.textContent)).toEqual(['경영'])
    get<HTMLInputElement>('#time').value = ''
    get('#time').dispatchEvent(new Event('input', { bubbles: true }))
    expect(rail.hidden).toBe(true)
    expect(rail.children).toHaveLength(0)
  })
})

// @vitest-environment happy-dom
// CSS/DOM contracts only. No browser process or visual geometry measurement.
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoomDialog } from '../src/detail'
import { AvailabilityEngine } from '../src/search'

const room = { id: '공A404', building: '공A', number: '404' }
const emptyRoom = { id: '새502', building: '새', number: '502' }
const course = { room: room.id, start_period: 1, subject_name: '기계수치해석', professor: '김교수' }
const engine = new AvailabilityEngine([room, emptyRoom], [
  { ...course, day: '월', end_period: 1 },
  { ...course, day: '화', end_period: 2, subject_name: '열전달' },
  { ...course, day: '화', end_period: 3, subject_name: '자료구조' },
  { ...course, day: '수', end_period: 3 },
], { timezone: 'Asia/Seoul' })
let show: ReturnType<typeof createRoomDialog>

beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false })
  show = createRoomDialog(engine)
  show(room)
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.body.classList.remove('dialog-open')
})

it.each([320, 390, 900, 901])('fits every weekday into a compact grid while preserving desktop (%ipx)', width => {
  const dom = new Window({ width, height: 800 })
  try {
    const style = dom.document.createElement('style')
    style.textContent = readFileSync('src/style.css', 'utf8')
    dom.document.head.append(style)
    dom.document.body.innerHTML = document.body.innerHTML
    const css = (selector: string) => dom.getComputedStyle(dom.document.querySelector(selector)!)
    expect(Array.from(dom.document.querySelectorAll('.timetable-day'), day => day.textContent)).toEqual(['월', '화', '수', '목', '금'])
    expect(dom.document.querySelectorAll('.timetable-column')).toHaveLength(5)
    expect(css('.timetable').getPropertyValue('--days')).toBe('5')
    if (width <= 900) {
      expect(css('.room-dialog').width).toBe('100%')
      expect(css('.room-dialog').maxWidth).toBe('none')
      // The DOM emulator does not resolve dvh; verify its CSS declaration.
      expect(style.textContent).toMatch(/\.room-dialog\s*\{[^}]*height: 100dvh; max-height: 100dvh;/)
      expect(css('.room-dialog').margin).toBe('0px')
      expect(css('.room-dialog').overflowX).toBe('hidden')
      expect(css('.room-dialog').overflowY).toBe('auto')
      expect(css('.timetable-scroll').overflowX).toBe('hidden')
      expect(parseFloat(css('.timetable').minWidth)).toBe(0)
      expect(css('.timetable').width).toBe('100%')
      expect(css('.timetable').gridTemplateColumns).toContain('34px')
      expect(css('.timetable').gridTemplateColumns).toContain('minmax(0, 1fr)')
      for (const selector of ['.timetable-day', '.time-axis', '.timetable-column']) expect(parseFloat(css(selector).minWidth)).toBe(0)
      expect(css('.course').overflow).toBe('hidden')
      expect(css('.course').padding).toBe('3px')
      expect(css('.course-subject').fontSize).toBe('11px')
      expect(css('.course-subject').order).toBe('0')
      expect(css('.course-professor').order).toBe('1')
      expect(css('.course-time').order).toBe('2')
      expect(css('.course-time').whiteSpace).toBe('normal')
      expect(css('[data-length="short"] .course-professor').display).toBe('none')
      expect(css('[data-length="short"] .course-time').display).toBe('none')
      expect(css('[data-length="medium"] .course-professor').display).not.toBe('none')
      expect(css('[data-length="medium"] .course-time').display).toBe('none')
      expect(css('[data-length="long"] .course-time').display).not.toBe('none')
      expect(css('.detail-content').paddingTop).toBe('0px')
      expect(Array.from(dom.document.querySelectorAll('div')).find(node => node.classList.contains('course'))!.tabIndex).toBe(0)
      expect(style.textContent).toMatch(/\.course:focus\s*\{ min-height: 0; outline-offset: -2px; \}/)
    } else {
      expect(css('.timetable').gridTemplateColumns).toContain('48px')
      expect(css('.timetable').gridTemplateColumns).toContain('minmax(126px, 1fr)')
      expect(css('.timetable-scroll').overflowX).toBe('auto')
      expect(css('.course').overflow).toBe('auto')
      expect(css('.course').padding).toBe('5px')
      expect(css('.course-subject').fontSize).toBe('12px')
      expect(css('[data-length="short"] .course-time').display).not.toBe('none')
      expect(css('.detail-content').paddingTop).toBe('0px')
    }
  } finally { dom.close() }
})

it('keeps overlap widths inside each day and course identity across weekdays', () => {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[aria-label="화요일"] .course'))
  expect(blocks).toHaveLength(2)
  expect(blocks.map(block => block.style.left)).toEqual([
    'calc(0% + var(--course-inset, 2px))', 'calc(50% + var(--course-inset, 2px))',
  ])
  for (const block of blocks) expect(block.style.width).toBe('calc(50% - var(--course-gutter, 4px))')
  const hue = (day: string) => document.querySelector<HTMLElement>(`[aria-label="${day}요일"] .course`)!.dataset.courseColor
  expect(hue('월')).toBe(hue('수'))
  const short = document.querySelector<HTMLElement>('[data-length="short"]')!
  expect(short.getAttribute('aria-label')).toContain('09:00–09:30 · 기계수치해석 · 김교수')
})

it('shows only room title, close button and timetable for every room', () => {
  for (const selected of [room, emptyRoom]) {
    document.querySelector('dialog')!.close()
    show(selected)
    const dialog = document.querySelector('dialog')!
    expect(dialog.querySelector('#room-title')!.textContent).toBe(`${selected.building} ${selected.number}`)
    expect(dialog.querySelector('.close-dialog')!.textContent).toBe('닫기')
    expect(dialog.querySelector('.detail-content')!.children).toHaveLength(1)
    expect(dialog.querySelector('.detail-content')!.firstElementChild!.className).toBe('timetable-scroll')
    expect(dialog.querySelectorAll('.timetable-day')).toHaveLength(5)
    expect(dialog.querySelector('.detail-overview, .detail-context, .detail-state, .detail-duration, .detail-next, .timetable-title')).toBeNull()
    for (const text of ['기준', '비어 있음', '다음 수업', '주간 시간표', '제한 없음']) expect(dialog.textContent).not.toContain(text)
  }
})

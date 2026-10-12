// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { courseColorIndex } from '../src/course-colors'
import { createRoomDialog } from '../src/detail'
import { AvailabilityEngine } from '../src/search'
import { defaultFilters } from '../src/state'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.body.classList.remove('dialog-open')
  document.documentElement.removeAttribute('data-theme')
})

it('renders the same course hue across weekdays, rooms and theme switches in the existing dialog', () => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false })
  const rooms = [
    { id: '공B155', building: '공B', number: '155' },
    { id: '공B156', building: '공B', number: '156' },
  ]
  const course = { start_period: 1, end_period: 3, subject_name: '기계수치해석', professor: '김교수' }
  const engine = new AvailabilityEngine(rooms, [
    { ...course, room: rooms[0].id, day: '월' },
    { ...course, room: rooms[0].id, day: '수' },
    { ...course, room: rooms[1].id, day: '화' },
  ], { timezone: 'Asia/Seoul' })
  const show = createRoomDialog(engine)
  const instant = new Date('2026-10-12T00:00:00Z')
  const state = defaultFilters(engine, instant)
  document.documentElement.dataset.theme = 'light'
  show(engine.getCurrentStatus(rooms[0].id, instant), state)
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('.course'))
  const hue = String(courseColorIndex(course.subject_name, course.professor))
  expect(blocks).toHaveLength(2)
  for (const block of blocks) {
    expect(block.dataset.courseColor).toBe(hue)
    expect(block.querySelector('.course-subject')?.textContent).toBe(course.subject_name)
    expect(block.querySelector('.course-time')?.textContent).toBe('09:00–10:30')
    expect(block.querySelector('.course-professor')?.textContent).toBe(course.professor)
    expect(block.style.height).not.toBe('')
  }
  document.documentElement.dataset.theme = 'dark'
  expect(blocks.every(block => block.dataset.courseColor === hue)).toBe(true)
  expect(document.querySelector('[aria-label="화요일"]')!.textContent).toBe('')
  document.querySelector('dialog')!.close()
  show(engine.getCurrentStatus(rooms[1].id, instant), state)
  expect(document.querySelectorAll('dialog')).toHaveLength(1)
  expect(document.querySelector<HTMLElement>('.course')!.dataset.courseColor).toBe(hue)
})

it('allocates distinct hues across the whole week even when different courses prefer the same hue', () => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  const room = { id: '공B155', building: '공B', number: '155' }
  const course = { room: room.id, start_period: 1, end_period: 3, professor: '김교수' }
  expect(courseColorIndex('과목0', course.professor)).toBe(courseColorIndex('과목8', course.professor))
  const engine = new AvailabilityEngine([room], [
    { ...course, day: '월', subject_name: '과목0' },
    { ...course, day: '수', subject_name: '과목0' },
    { ...course, day: '화', subject_name: '과목8' },
  ], { timezone: 'Asia/Seoul' })
  const instant = new Date('2026-10-12T00:00:00Z')
  createRoomDialog(engine)(engine.getCurrentStatus(room.id, instant), defaultFilters(engine, instant))
  const hue = (day: string) => document.querySelector<HTMLElement>(`[aria-label="${day}요일"] .course`)!.dataset.courseColor
  expect(hue('월')).toBe(hue('수'))
  expect(hue('월')).not.toBe(hue('화'))
  document.documentElement.dataset.theme = 'dark'
  expect(hue('월')).toBe(hue('수'))
  expect(hue('월')).not.toBe(hue('화'))
})

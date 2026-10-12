import { DAYS } from './data'
import type { Day } from './data'
import { formatMinutes } from './search'
import type { AvailabilityEngine, RoomStatus } from './search'
import { availabilityText, nextClassText } from './state'
import type { FilterState } from './state'
import { assignCourseColors, courseIdentity } from './course-colors'

export interface TimetableBlock {
  day: Day
  start: number
  end: number
  subject: string
  professor: string
  lane: number
  lanes: number
}

/** Display-only grouping and overlap placement; never changes search schedules. */
export function timetableBlocks(engine: AvailabilityEngine, roomId: string, day: Day): TimetableBlock[] {
  const blocks: TimetableBlock[] = []
  for (const schedule of engine.getDaySchedules(roomId, day)) {
    const [start, end] = engine.scheduleInterval(schedule)
    const subject = schedule.subject_name ?? ''
    const professor = schedule.professor ?? ''
    const previous = blocks.find(block => subject && block.subject === subject
      && block.professor === professor && block.end >= start)
    if (previous) previous.end = Math.max(previous.end, end)
    else blocks.push({ day, start, end, subject, professor, lane: 0, lanes: 1 })
  }
  blocks.sort((a, b) => a.start - b.start || a.end - b.end)
  let group: TimetableBlock[] = []
  let ends: number[] = []
  const finishGroup = () => { for (const block of group) block.lanes = ends.length }
  for (const block of blocks) {
    if (group.length && block.start >= Math.max(...ends)) {
      finishGroup()
      group = []
      ends = []
    }
    let lane = ends.findIndex(end => end <= block.start)
    if (lane === -1) lane = ends.length
    block.lane = lane
    ends[lane] = block.end
    group.push(block)
  }
  finishGroup()
  return blocks
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

export function createRoomDialog(engine: AvailabilityEngine) {
  const dialog = document.createElement('dialog')
  dialog.className = 'room-dialog'
  dialog.setAttribute('aria-labelledby', 'room-title')
  const header = element('header', 'detail-header')
  const title = element('h2', '', '')
  title.id = 'room-title'
  const close = element('button', 'close-dialog', '닫기')
  close.type = 'button'
  close.autofocus = true
  close.addEventListener('click', () => dialog.close())
  header.append(title, close)
  const content = element('div', 'detail-content')
  dialog.append(header, content)
  document.body.append(dialog)
  dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'))

  return (status: RoomStatus, state: FilterState) => {
    const room = status.room!
    title.textContent = `${room.building} ${room.number}`.trim()
    content.replaceChildren()
    const overview = element('div', 'detail-overview')
    const occupied = status.state === 'occupied'
    overview.append(element('p', 'detail-context', `${state.day}요일 ${state.time} 기준${occupied ? '' : ' · 비어 있음'}`),
      element('p', 'detail-duration', occupied ? '수업 중' : availabilityText(status)),
      element('p', 'detail-next', occupied ? `${status.occupied_until} 종료` : nextClassText(status)))
    content.append(overview, element('h3', 'timetable-title', '주간 시간표'))

    // Always show Mon–Fri. If the release contains weekend classes for this
    // room, show those columns too so the next class never contradicts the grid.
    const days = DAYS.filter((day, index) => index < 5 || engine.getDaySchedules(room.id, day).length > 0)
    const blocks = days.flatMap(day => timetableBlocks(engine, room.id, day))
    const courseColors = assignCourseColors(blocks)
    const start = Math.min(engine.dayStartMinutes, ...blocks.map(block => block.start))
    const end = Math.max(engine.dayEndMinutes, ...blocks.map(block => block.end))
    const scroll = element('div', 'timetable-scroll')
    scroll.tabIndex = 0
    scroll.setAttribute('role', 'region')
    scroll.setAttribute('aria-label', '주간 시간표. 좌우로 스크롤할 수 있습니다')
    const grid = element('div', 'timetable')
    grid.style.setProperty('--days', String(days.length))
    grid.style.setProperty('--timeline-height', `${(end - start) * 1.15}px`)
    grid.append(element('div', 'timetable-corner', '시간'))
    for (const day of days) grid.append(element('div', 'timetable-day', day))
    const axis = element('div', 'time-axis')
    for (let minute = start; minute <= end; minute += 30) {
      const tick = element('span', 'time-tick', minute % 60 === 0 || minute === end ? formatMinutes(minute) : '')
      tick.style.top = `${(minute - start) / (end - start) * 100}%`
      axis.append(tick)
    }
    grid.append(axis)
    for (const day of days) {
      const column = element('div', 'timetable-column')
      column.setAttribute('role', 'group')
      column.setAttribute('aria-label', `${day}요일`)
      for (let minute = start + 30; minute < end; minute += 30) {
        const line = element('span', 'time-line')
        line.style.top = `${(minute - start) / (end - start) * 100}%`
        line.setAttribute('aria-hidden', 'true')
        column.append(line)
      }
      const dayBlocks = blocks.filter(block => block.day === day)
      for (const block of dayBlocks) {
        const course = element('div', 'course')
        course.dataset.courseColor = String(courseColors.get(courseIdentity(block.subject, block.professor))!)
        const hours = `${formatMinutes(block.start)}–${formatMinutes(block.end)}`
        course.title = `${day} ${hours} · ${block.subject || '과목명 없음'}${block.professor ? ` · ${block.professor}` : ''}`
        course.tabIndex = 0
        course.setAttribute('aria-label', course.title)
        course.style.top = `${(block.start - start) / (end - start) * 100}%`
        course.style.height = `${(block.end - block.start) / (end - start) * 100}%`
        course.style.left = `calc(${block.lane / block.lanes * 100}% + 2px)`
        course.style.width = `calc(${100 / block.lanes}% - 4px)`
        course.append(element('span', 'course-time', hours),
          element('strong', 'course-subject', block.subject || '과목명 없음'))
        if (block.professor) course.append(element('span', 'course-professor', block.professor))
        column.append(course)
      }
      grid.append(column)
    }
    scroll.append(grid)
    content.append(scroll)
    document.body.classList.add('dialog-open')
    dialog.showModal()
  }
}

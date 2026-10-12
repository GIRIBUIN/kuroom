import { DAYS } from './data'
import type { Day, Manifest, Room, Schedule } from './data'

// Period conversion and weekly search semantics mirror the Python reference.
export const DAY_START_MINUTES = 9 * 60
export const PERIOD_MINUTES = 30
export const DEFAULT_LAST_PERIOD = 19

export const AvailabilityState = {
  OCCUPIED: 'occupied',
  FREE_UNTIL: 'free_until',
  FREE_ALL_WEEK: 'free_all_week',
} as const
export type AvailabilityState = (typeof AvailabilityState)[keyof typeof AvailabilityState]
export type Interval = [number, number]

/** A selected weekday/time on the campus timetable, not an instant. */
export interface CampusWallClock {
  day: Day
  hour: number
  minute: number
}

function wallClockMinutes(time: CampusWallClock): number {
  if (!DAYS.includes(time.day)
    || !Number.isInteger(time.hour) || time.hour < 0 || time.hour > 23
    || !Number.isInteger(time.minute) || time.minute < 0 || time.minute > 59) {
    throw new Error('campus wall-clock: 유효한 요일과 시(0~23)·분(0~59)이 필요합니다')
  }
  return time.hour * 60 + time.minute
}

interface StatusBase {
  room: Room | null
  room_id: string
  day: Day
  has_classes_today: boolean
}

interface NoOccupation {
  occupied_until_minutes: null
  occupied_until: null
}

interface NoFreeDuration {
  free_until_minutes: null
  free_until: null
  free_minutes: null
}

export type RoomStatus = StatusBase & (
  | (NoFreeDuration & {
      state: 'occupied'
      current_classes: Schedule[]
      next_class: null
      next_class_day_offset: null
      occupied_until_minutes: number
      occupied_until: string
    })
  | (NoOccupation & {
      state: 'free_until'
      current_classes: Schedule[]
      next_class: Schedule
      next_class_day_offset: number
      free_until_minutes: number
      free_until: string
      free_minutes: number
    })
  | (NoOccupation & NoFreeDuration & {
      state: 'free_all_week'
      current_classes: Schedule[]
      next_class: null
      next_class_day_offset: null
    })
)

export function periodStartMinutes(period: number): number {
  if (period < 1) throw new Error('period must be >= 1')
  return DAY_START_MINUTES + (period - 1) * PERIOD_MINUTES
}

export function periodEndMinutes(period: number): number {
  if (period < 1) throw new Error('period must be >= 1')
  return DAY_START_MINUTES + period * PERIOD_MINUTES
}

export function periodRangeMinutes(start: number, end: number): Interval {
  if (start > end) throw new Error('start_period must be <= end_period')
  return [periodStartMinutes(start), periodEndMinutes(end)]
}

export function formatMinutes(value: number | null): string {
  if (value === null) return '-'
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const ordered = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Interval[] = [[...ordered[0]]]
  for (const [start, end] of ordered.slice(1)) {
    const previous = merged[merged.length - 1]
    if (start <= previous[1]) previous[1] = Math.max(previous[1], end)
    else merged.push([start, end])
  }
  return merged
}

export function invertIntervals(busy: Interval[], start: number, end: number): Interval[] {
  const result: Interval[] = []
  let cursor = start
  for (let [busyStart, busyEnd] of mergeIntervals(busy)) {
    busyStart = Math.max(busyStart, start)
    busyEnd = Math.min(busyEnd, end)
    if (busyEnd <= start) continue
    if (busyStart >= end) break
    if (cursor < busyStart) result.push([cursor, busyStart])
    cursor = Math.max(cursor, busyEnd)
  }
  if (cursor < end) result.push([cursor, end])
  return result
}

// Python compares Unicode code points, not locale-dependent collation order.
function compareStrings(a: string, b: string): number {
  const left = Array.from(a, char => char.codePointAt(0)!)
  const right = Array.from(b, char => char.codePointAt(0)!)
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

function decimalInteger(value: string): bigint {
  // Python \d/int also accept Unicode decimal digits. Unicode digit blocks
  // contain contiguous groups of ten (some mathematical groups are adjacent).
  const digits = Array.from(value, digit => {
    const point = digit.codePointAt(0)!
    let blockStart = point
    while (/\p{Decimal_Number}/u.test(String.fromCodePoint(blockStart - 1))) blockStart--
    return String((point - blockStart) % 10)
  }).join('')
  return BigInt(digits)
}

function compareRoomNumbers(a: string, b: string): number {
  const left = /^(\p{Decimal_Number}+)(.*)$/u.exec(a)
  const right = /^(\p{Decimal_Number}+)(.*)$/u.exec(b)
  if (!left && !right) return compareStrings(a, b)
  if (!left) return 1
  if (!right) return -1
  // BigInt preserves Python int ordering for long numeric room numbers.
  const leftNumber = decimalInteger(left[1])
  const rightNumber = decimalInteger(right[1])
  if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1
  return compareStrings(left[2], right[2])
}

export class AvailabilityEngine {
  readonly roomMaster: Room[]
  readonly schedules: Schedule[]
  readonly rooms: Map<string, Room>
  readonly scheduleIndex = new Map<string, Map<Day, Schedule[]>>()
  readonly lastPeriod: number
  readonly dayStartMinutes = DAY_START_MINUTES
  readonly dayEndMinutes: number
  readonly timezone: Manifest['timezone']
  private readonly instantFormatter: Intl.DateTimeFormat

  constructor(roomMaster: Room[], schedules: Schedule[], manifest: Pick<Manifest, 'timezone'>) {
    // Never let an absent/unsupported zone fall back to the browser timezone.
    if (manifest.timezone !== 'Asia/Seoul') {
      throw new Error('manifest.timezone: V0는 Asia/Seoul만 지원합니다')
    }
    this.timezone = manifest.timezone
    this.instantFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23', numberingSystem: 'latn', calendar: 'gregory',
    })
    this.roomMaster = roomMaster
    this.schedules = schedules
    this.rooms = new Map(roomMaster.map(room => [room.id, room]))
    let maxEndPeriod = DEFAULT_LAST_PERIOD
    for (const schedule of schedules) {
      if (!schedule.room || !schedule.day) continue
      let days = this.scheduleIndex.get(schedule.room)
      if (!days) {
        days = new Map()
        this.scheduleIndex.set(schedule.room, days)
      }
      const entries = days.get(schedule.day) ?? []
      entries.push(schedule)
      days.set(schedule.day, entries)
      maxEndPeriod = Math.max(maxEndPeriod, schedule.end_period)
    }
    this.lastPeriod = maxEndPeriod
    this.dayEndMinutes = periodEndMinutes(this.lastPeriod)
    for (const days of this.scheduleIndex.values()) {
      for (const entries of days.values()) {
        entries.sort((a, b) => a.start_period - b.start_period || a.end_period - b.end_period)
      }
    }
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null
  }

  getDaySchedules(roomId: string, day: Day): Schedule[] {
    return [...(this.scheduleIndex.get(roomId)?.get(day) ?? [])]
  }

  scheduleInterval(schedule: Schedule): Interval {
    return periodRangeMinutes(schedule.start_period, schedule.end_period)
  }

  getBusyIntervals(roomId: string, day: Day): Interval[] {
    return mergeIntervals(this.getDaySchedules(roomId, day).map(schedule => this.scheduleInterval(schedule)))
  }

  getFreeIntervals(roomId: string, day: Day): Interval[] {
    return invertIntervals(this.getBusyIntervals(roomId, day), this.dayStartMinutes, this.dayEndMinutes)
  }

  getRoomDayDetail(roomId: string, day: Day) {
    const classes = this.getDaySchedules(roomId, day).map(schedule => {
      const [start, end] = this.scheduleInterval(schedule)
      return { ...schedule, start_minutes: start, end_minutes: end, start: formatMinutes(start), end: formatMinutes(end) }
    })
    const free = this.getFreeIntervals(roomId, day).map(([start, end]) => ({
      start_minutes: start, end_minutes: end,
      start: formatMinutes(start), end: formatMinutes(end), minutes: end - start,
    }))
    return { room: this.getRoom(roomId), day, classes, free }
  }

  /** Converts an actual instant using manifest.timezone, regardless of the host zone. */
  toCampusWallClock(instant: Date): CampusWallClock {
    if (!Number.isFinite(instant.getTime())) throw new Error('instant: 유효한 Date가 필요합니다')
    const parts = this.instantFormatter.formatToParts(instant)
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value
    const weekdays: Record<string, Day> = {
      Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토', Sun: '일',
    }
    return { day: weekdays[value('weekday')], hour: Number(value('hour')), minute: Number(value('minute')) }
  }

  /** Date is an instant; omitting it searches the actual current time. */
  getCurrentStatus(roomId: string, instant: Date = new Date()): RoomStatus {
    return this.getStatusAtWallClock(roomId, this.toCampusWallClock(instant))
  }

  /** Manual weekday/time selection in the campus zone; no Date or timezone conversion. */
  getStatusAtWallClock(roomId: string, time: CampusWallClock): RoomStatus {
    const day = time.day
    const nowMinutes = wallClockMinutes(time)
    const schedules = this.getDaySchedules(roomId, day)
    const base = {
      room: this.getRoom(roomId), room_id: roomId, day,
      has_classes_today: schedules.length > 0,
      current_classes: [] as Schedule[], next_class: null,
      next_class_day_offset: null,
      occupied_until_minutes: null, occupied_until: null,
      free_until_minutes: null, free_until: null, free_minutes: null,
    }
    const intervals = schedules.map(schedule => {
      const [start, end] = this.scheduleInterval(schedule)
      return { schedule, start, end }
    })
    const current = intervals.filter(({ start, end }) => start <= nowMinutes && nowMinutes < end)
    if (current.length > 0) {
      const occupiedUntil = Math.max(...current.map(item => item.end))
      return {
        ...base, state: AvailabilityState.OCCUPIED,
        current_classes: current.map(item => item.schedule),
        occupied_until_minutes: occupiedUntil, occupied_until: formatMinutes(occupiedUntil),
      }
    }
    // Include day 7: today's earlier classes recur next week. Preserve Saturday
    // and Sunday schedules too, rather than assuming every weekend is empty.
    for (let offset = 0; offset <= 7; offset++) {
      const nextDay = DAYS[(DAYS.indexOf(day) + offset) % 7]
      const future = this.getDaySchedules(roomId, nextDay).map(schedule => ({
        schedule, start: this.scheduleInterval(schedule)[0],
      })).filter(item => offset * 1440 + item.start > nowMinutes)
      if (future.length > 0) {
        const next = future.reduce((first, item) => item.start < first.start ? item : first)
        return {
          ...base, state: AvailabilityState.FREE_UNTIL, next_class: next.schedule,
          next_class_day_offset: offset,
          // Clock minutes on the next class's day, not minutes since this week began.
          free_until_minutes: next.start, free_until: formatMinutes(next.start),
          free_minutes: offset * 1440 + next.start - nowMinutes,
        }
      }
    }
    return { ...base, state: AvailabilityState.FREE_ALL_WEEK }
  }

  /** Date is an instant; omitting it searches the actual current time. */
  findAvailableRooms(instant: Date = new Date(), building: string | null = null, minMinutes = 0): RoomStatus[] {
    return this.findAvailableRoomsAtWallClock(this.toCampusWallClock(instant), building, minMinutes)
  }

  /** Manual campus weekday/time on the repeating weekly timetable. */
  findAvailableRoomsAtWallClock(time: CampusWallClock, building: string | null = null, minMinutes = 0): RoomStatus[] {
    wallClockMinutes(time)
    const result: RoomStatus[] = []
    for (const room of this.roomMaster) {
      if (building !== null && room.building !== building) continue
      const status = this.getStatusAtWallClock(room.id, time)
      if (status.state === AvailabilityState.OCCUPIED) continue
      if (status.state === AvailabilityState.FREE_UNTIL && status.free_minutes < minMinutes) continue
      result.push(status)
    }
    result.sort((a, b) => compareStrings(a.room!.building, b.room!.building)
      || compareRoomNumbers(a.room!.number, b.room!.number))
    return result
  }
}

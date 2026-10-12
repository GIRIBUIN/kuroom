import type { Day } from './data'
import { formatMinutes } from './search'
import type { AvailabilityEngine, RoomStatus } from './search'

export interface FilterState {
  day: Day
  time: string
  minMinutes: number
  /** An empty selection means all buildings. */
  buildings: string[]
}

export const MINUTE_OPTIONS = [30, 60, 90, 120]
export const isClockTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

export function defaultFilters(engine: AvailabilityEngine, instant = new Date()): FilterState {
  const time = engine.toCampusWallClock(instant)
  return { day: time.day, time: formatMinutes(time.hour * 60 + time.minute), minMinutes: 60, buildings: [] }
}

export function selectBuildings(selected: string[], known: string[]): string[] {
  const buildings = [...new Set(selected)].filter(building => known.includes(building))
  return buildings.length === known.length ? [] : buildings
}

export function searchRooms(engine: AvailabilityEngine, state: FilterState): RoomStatus[] {
  if (!isClockTime(state.time)) throw new Error('유효한 시간을 입력해 주세요.')
  const [hour, minute] = state.time.split(':').map(Number)
  const result = engine.findAvailableRoomsAtWallClock({ day: state.day, hour, minute }, null, state.minMinutes)
  // Multiple buildings only restrict the existing result; retain the engine's order.
  return state.buildings.length === 0 ? result : result.filter(status => state.buildings.includes(status.room!.building))
}

export function availabilityText(status: RoomStatus): string {
  if (status.state === 'free_until') return formatDuration(status.free_minutes)
  if (status.state === 'free_all_week') return '다음 수업 없음'
  throw new Error('검색 결과에 공실이 아닌 강의실이 포함되었습니다.')
}

export function formatDuration(minutes: number): string {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes % 1440 / 60)
  const rest = minutes % 60
  return [days && `${days}일`, hours && `${hours}시간`, rest && `${rest}분`].filter(Boolean).join(' ') || '0분'
}

export function nextClassText(status: RoomStatus): string {
  if (status.state !== 'free_until') return '등록된 주간 수업 없음'
  const day = status.next_class_day_offset === 0 ? ''
    : `${status.next_class_day_offset === 7 ? '다음 주 ' : ''}${status.next_class.day} `
  return `다음 수업 ${day}${status.free_until}`
}

/** The now button changes only weekday/time, leaving other filters intact. */
export function applyNow(engine: AvailabilityEngine, state: FilterState, instant = new Date()): FilterState {
  const current = defaultFilters(engine, instant)
  return { ...state, day: current.day, time: current.time }
}

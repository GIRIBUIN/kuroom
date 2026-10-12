import { DAYS } from './data'
import type { Day } from './data'
import { isClockTime, selectBuildings } from './state'
import type { FilterState } from './state'

const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Missing or invalid fields fall back independently to the Seoul-time defaults. */
export function readFilters(url: URL, defaults: FilterState, buildings: string[]): FilterState {
  const params = url.searchParams
  const dayIndex = DAY_CODES.indexOf(params.get('day') ?? '')
  const time = params.get('time') ?? ''
  const min = params.get('min') ?? ''
  const minMinutes = /^\d+$/.test(min) && Number.isSafeInteger(Number(min)) ? Number(min) : defaults.minMinutes
  return {
    day: dayIndex >= 0 ? DAYS[dayIndex] : defaults.day,
    time: isClockTime(time) ? time : defaults.time,
    minMinutes,
    buildings: selectBuildings((params.get('building') ?? '').split(',').filter(Boolean), buildings),
  }
}

/** Store the resolved snapshot so refreshing/sharing reproduces the same conditions. */
export function writeFilters(url: URL, state: FilterState): URL {
  const next = new URL(url)
  next.searchParams.set('day', DAY_CODES[DAYS.indexOf(state.day as Day)])
  next.searchParams.set('time', state.time)
  next.searchParams.set('min', String(state.minMinutes))
  if (state.buildings.length) next.searchParams.set('building', state.buildings.join(','))
  else next.searchParams.delete('building')
  return next
}

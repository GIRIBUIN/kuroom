import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReleaseData } from '../src/data'
import { AvailabilityEngine } from '../src/search'
import { applyNow, availabilityText, defaultFilters, formatDuration, nextClassText, searchRooms, selectBuildings } from '../src/state'
import type { FilterState } from '../src/state'
import { readFilters, writeFilters } from '../src/url'

const read = (name: string) => JSON.parse(readFileSync(
  new URL(`../../data/releases/2026_B01012/${name}.json`, import.meta.url), 'utf8',
))
const data = parseReleaseData(read('manifest'), read('rooms'), read('schedules'))
const engine = new AvailabilityEngine(data.rooms, data.schedules, data.manifest)
const buildings = [...new Set(data.rooms.map(room => room.building))]
const defaults = defaultFilters(engine, new Date('2026-10-14T04:30:00Z'))

describe('UI filter and URL state', () => {
  it('defaults to the exact current Seoul wall clock, not a rounded or host-local time', () => {
    expect(defaultFilters(engine, new Date('2026-10-13T21:37:00-07:00'))).toEqual({
      day: '수', time: '13:37', minMinutes: 60, buildings: [],
    })
    expect(readFilters(new URL('https://kuroom.test/'), defaults, buildings)).toEqual(defaults)
  })

  it('retains the real current weekday on weekends', () => {
    expect(defaultFilters(engine, new Date('2026-10-17T00:00:00Z')).day).toBe('토')
  })

  it('restores shared conditions independently of the time when the URL is opened', () => {
    const selected: FilterState = { day: '수', time: '13:30', minMinutes: 60, buildings: ['공B', '새'] }
    const shared = writeFilters(new URL('https://kuroom.test/'), selected)
    expect(shared.searchParams.get('day')).toBe('wed')
    expect(shared.searchParams.get('time')).toBe('13:30')
    expect(shared.searchParams.get('min')).toBe('60')
    expect(shared.searchParams.get('building')).toBe('공B,새')
    const laterDefaults = defaultFilters(engine, new Date('2026-10-16T09:00:00Z'))
    const restored = readFilters(shared, laterDefaults, buildings)
    expect(restored).toEqual(selected)
    expect(searchRooms(engine, restored)).toEqual(searchRooms(engine, selected))
  })

  it('falls back safely for invalid day, time and minimum duration', () => {
    const invalid = new URL('https://kuroom.test/?day=no&time=24:60&min=-30&building=없는건물')
    expect(readFilters(invalid, defaults, buildings)).toEqual(defaults)
    expect(readFilters(new URL('https://kuroom.test/?min=60.5'), defaults, buildings).minMinutes).toBe(60)
    expect(readFilters(new URL('https://kuroom.test/?min=9007199254740992'), defaults, buildings).minMinutes).toBe(60)
  })

  it('restores valid partial parameters and preserves a zero-minute reference query', () => {
    expect(readFilters(new URL('https://kuroom.test/?day=mon&min=0'), defaults, buildings))
      .toEqual({ ...defaults, day: '월', minMinutes: 0 })
    const baseline = readFilters(new URL('https://kuroom.test/?day=mon&time=09:00&min=0'), defaults, buildings)
    expect(searchRooms(engine, baseline)).toHaveLength(301)
  })

  it('deduplicates known buildings and treats no selection or every building as all', () => {
    expect(selectBuildings(['공B', '공B', '없는건물', '새'], buildings)).toEqual(['공B', '새'])
    expect(selectBuildings([], buildings)).toEqual([])
    expect(selectBuildings(buildings, buildings)).toEqual([])
  })

  it('preserves the path, unrelated query parameters and hash, and omits all-building selection', () => {
    const url = writeFilters(new URL('https://kuroom.test/campus/?source=shared&building=공B#results'), defaults)
    expect(url.pathname).toBe('/campus/')
    expect(url.searchParams.get('source')).toBe('shared')
    expect(url.searchParams.has('building')).toBe(false)
    expect(url.hash).toBe('#results')
    expect(readFilters(url, defaults, buildings)).toEqual(defaults)
  })

  it('combines building filters without changing engine order or searching occupied rooms', () => {
    const state: FilterState = { day: '월', time: '15:20', minMinutes: 60, buildings: ['새', '공B'] }
    const result = searchRooms(engine, state)
    const expected = engine.findAvailableRoomsAtWallClock({ day: '월', hour: 15, minute: 20 }, null, 60)
      .filter(status => ['공B', '새'].includes(status.room!.building))
    expect(result).toEqual(expected)
    expect(result).toHaveLength(18)
    expect(result.every(status => ['free_until', 'free_all_week'].includes(status.state))).toBe(true)
  })

  it('prioritizes duration and identifies the next weekday, including the same day next week', () => {
    const small = new AvailabilityEngine([{ id: '공B155', building: '공B', number: '155' }], [
      { room: '공B155', day: '월', start_period: 11, end_period: 13 },
    ], data.manifest)
    expect(availabilityText(small.getStatusAtWallClock('공B155', { day: '월', hour: 12, minute: 0 })))
      .toBe('2시간')
    expect(availabilityText(small.getStatusAtWallClock('공B155', { day: '월', hour: 16, minute: 0 })))
      .toBe('6일 22시간')
    expect(nextClassText(small.getStatusAtWallClock('공B155', { day: '월', hour: 16, minute: 0 })))
      .toBe('다음 수업 다음 주 월 14:00')
    expect(nextClassText(small.getStatusAtWallClock('공B155', { day: '수', hour: 12, minute: 0 })))
      .toBe('다음 수업 월 14:00')
    expect(nextClassText(small.getStatusAtWallClock('공B155', { day: '월', hour: 12, minute: 0 })))
      .toBe('다음 수업 14:00')
    const empty = new AvailabilityEngine(small.roomMaster, [], data.manifest)
      .getStatusAtWallClock('공B155', { day: '수', hour: 12, minute: 0 })
    expect(availabilityText(empty)).toBe('다음 수업 없음')
    expect(formatDuration(703)).toBe('11시간 43분')
    expect(formatDuration(10)).toBe('10분')
  })

  it('includes outside hours and rejects incomplete clock inputs', () => {
    expect(searchRooms(engine, { ...defaults, time: '08:00', minMinutes: 0 })).toHaveLength(data.rooms.length)
    expect(() => searchRooms(engine, { ...defaults, time: '' })).toThrow(/시간/)
  })

  it('applies now in Seoul and retains duration and building selection', () => {
    const selected = { ...defaults, minMinutes: 90, buildings: ['공B', '새'] }
    expect(applyNow(engine, selected, new Date('2026-10-12T12:17:00Z'))).toEqual({
      ...selected, day: '월', time: '21:17',
    })
  })
})

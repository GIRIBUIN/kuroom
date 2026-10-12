import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReleaseData } from '../src/data'
import type { Room, Schedule } from '../src/data'
import {
  AvailabilityEngine, AvailabilityState, invertIntervals, mergeIntervals,
  periodEndMinutes, periodRangeMinutes, periodStartMinutes,
} from '../src/search'

// These fixture dates are in Seoul (UTC+9); never construct a host-local Date.
const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 9, day, hour - 9, minute))
const manifest = { timezone: 'Asia/Seoul' } as const
const rooms: Room[] = [
  { id: '공B352', building: '공B', number: '352' },
  { id: '공B170', building: '공B', number: '170' },
  { id: '새101', building: '새', number: '101' },
]
const schedules: Schedule[] = [
  { room: '공B352', day: '월', start_period: 4, end_period: 6, subject_name: '수업A' },
  { room: '공B352', day: '월', start_period: 11, end_period: 13, subject_name: '수업B' },
]

describe('Python reference semantics', () => {
  const engine = new AvailabilityEngine(rooms, schedules, manifest)

  it('converts inclusive end periods to exclusive end times', () => {
    expect(periodStartMinutes(4)).toBe(630)
    expect(periodEndMinutes(6)).toBe(720)
    expect(periodRangeMinutes(4, 6)).toEqual([630, 720])
    expect(() => periodStartMinutes(0)).toThrow(/period must be >= 1/)
    expect(() => periodRangeMinutes(6, 4)).toThrow(/start_period must be <= end_period/)
  })

  it('returns occupied at the exact class start and ignores seconds', () => {
    const now = at(12, 10, 30)
    now.setUTCSeconds(59)
    expect(engine.getCurrentStatus('공B352', now)).toEqual({
      state: AvailabilityState.OCCUPIED,
      room: rooms[0], room_id: '공B352', day: '월', has_classes_today: true,
      current_classes: [schedules[0]], next_class: null,
      occupied_until_minutes: 720, occupied_until: '12:00',
      free_until_minutes: null, free_until: null, free_minutes: null,
    })
  })

  it.each([[12, 0, 120], [12, 30, 90]])('returns free_until at %i:%i', (hour, minute, duration) => {
    expect(engine.getCurrentStatus('공B352', at(12, hour, minute))).toMatchObject({
      state: AvailabilityState.FREE_UNTIL,
      current_classes: [], next_class: schedules[1],
      occupied_until: null, occupied_until_minutes: null,
      free_until: '14:00', free_until_minutes: 840, free_minutes: duration,
    })
  })

  it('includes exactly 60 minutes, excludes 59, and filters buildings exactly', () => {
    const ids = (hour: number, minute: number) => engine.findAvailableRooms(at(12, hour, minute), '공B', 60)
      .map(status => status.room_id)
    expect(ids(13, 0)).toEqual(['공B170', '공B352'])
    expect(ids(13, 1)).toEqual(['공B170'])
    expect(engine.findAvailableRooms(at(12, 13), '공')).toEqual([])
  })

  it('does not invent a duration or apply minMinutes after the final class', () => {
    expect(engine.getCurrentStatus('공B352', at(12, 16))).toMatchObject({
      state: AvailabilityState.FREE_REST_OF_DAY, has_classes_today: true,
      next_class: null, free_until: null, free_until_minutes: null, free_minutes: null,
    })
    expect(engine.getCurrentStatus('공B170', at(12, 16))).toMatchObject({
      state: AvailabilityState.FREE_REST_OF_DAY, has_classes_today: false, free_minutes: null,
    })
    expect(engine.findAvailableRooms(at(12, 16), '공B', 1000).map(status => status.room_id))
      .toEqual(['공B170', '공B352'])
  })

  it.each([[8, 59], [18, 30], [20, 0]])('excludes outside hours at %i:%i', (hour, minute) => {
    expect(engine.getCurrentStatus('공B352', at(12, hour, minute))).toMatchObject({
      state: AvailabilityState.OUTSIDE_REGULAR_HOURS, has_classes_today: true,
      current_classes: [], next_class: null,
      occupied_until: null, occupied_until_minutes: null,
      free_until: null, free_until_minutes: null, free_minutes: null,
    })
    expect(engine.findAvailableRooms(at(12, hour, minute))).toEqual([])
  })

  it('extends the global end time using schedules from any room or day', () => {
    const extended = new AvailabilityEngine(rooms, [
      ...schedules, { room: '새101', day: '화', start_period: 23, end_period: 23 },
    ], manifest)
    expect(extended.lastPeriod).toBe(23)
    expect(extended.dayEndMinutes).toBe(1230)
    expect(extended.getCurrentStatus('공B170', at(12, 20, 29)).state).toBe('free_rest_of_day')
    expect(extended.findAvailableRooms(at(12, 20, 30))).toEqual([])
  })

  it('uses the latest currently occupied end, without extending through future classes', () => {
    const overlap = new AvailabilityEngine(rooms, [
      { ...schedules[0], start_period: 5, end_period: 8 },
      { ...schedules[0], start_period: 7, end_period: 10 },
      schedules[0],
    ], manifest)
    const status = overlap.getCurrentStatus('공B352', at(12, 11, 30))
    expect(status.current_classes.map(schedule => schedule.end_period)).toEqual([6, 8])
    expect(status.occupied_until).toBe('13:00')
    expect(overlap.getBusyIntervals('공B352', '월')).toEqual([[630, 840]])
  })

  it('selects the first next class after stable period sorting', () => {
    const tie = { ...schedules[0], end_period: 5 }
    const tied = new AvailabilityEngine(rooms, [schedules[0], tie, { ...tie, subject_name: '동일교시' }], manifest)
    expect(tied.getCurrentStatus('공B352', at(12, 9)).next_class).toEqual(tie)
  })

  it('merges touching intervals, clips their inverse, and returns day details', () => {
    expect(mergeIntervals([[700, 720], [630, 700], [710, 750]])).toEqual([[630, 750]])
    expect(invertIntervals([[0, 500], [510, 550], [600, 650], [800, 900]], 540, 780))
      .toEqual([[550, 600], [650, 780]])
    expect(engine.getFreeIntervals('공B352', '월')).toEqual([[540, 630], [720, 840], [930, 1110]])
    expect(engine.getRoomDayDetail('공B352', '월')).toMatchObject({
      room: rooms[0], day: '월',
      classes: [
        { ...schedules[0], start_minutes: 630, end_minutes: 720, start: '10:30', end: '12:00' },
        { ...schedules[1], start_minutes: 840, end_minutes: 930, start: '14:00', end: '15:30' },
      ],
      free: [
        { start_minutes: 540, end_minutes: 630, start: '09:00', end: '10:30', minutes: 90 },
        { start_minutes: 720, end_minutes: 840, start: '12:00', end: '14:00', minutes: 120 },
        { start_minutes: 930, end_minutes: 1110, start: '15:30', end: '18:30', minutes: 180 },
      ],
    })
  })

  it('returns empty-day and unknown-room status as the reference does', () => {
    expect(engine.getCurrentStatus('공B352', at(17, 12))).toMatchObject({
      day: '토', state: 'free_rest_of_day', has_classes_today: false,
    })
    expect(engine.getCurrentStatus('unknown', at(18, 12))).toMatchObject({
      room: null, day: '일', state: 'free_rest_of_day', has_classes_today: false,
    })
    const entries = engine.getDaySchedules('공B352', '월')
    entries.pop()
    expect(engine.getDaySchedules('공B352', '월')).toHaveLength(2)
  })

  it('sorts buildings by code point and rooms by numeric prefix then suffix', () => {
    const unsorted = ['A', '10', '2B', '2A', '2', '02', '']
      .map(number => ({ id: `공B${number}`, building: '공B', number }))
    const sorted = new AvailabilityEngine([rooms[2], ...unsorted, rooms[1]], [], manifest)
      .findAvailableRooms(at(12, 9)).map(status => status.room_id)
    expect(sorted).toEqual(['공B2', '공B02', '공B2A', '공B2B', '공B10', '공B170', '공B', '공BA', '새101'])
  })

  it('preserves Python Unicode decimal digit and arbitrary-size integer sorting', () => {
    const numbers = ['9007199254740993', '9007199254740992', '10', '２B', '𝟚A', '٢', '02']
    const entries = numbers.map(number => ({ id: `공B${number}`, building: '공B', number }))
    expect(new AvailabilityEngine(entries, [], manifest).findAvailableRooms(at(12, 9)).map(status => status.room!.number))
      .toEqual(['٢', '02', '𝟚A', '２B', '10', '9007199254740992', '9007199254740993'])
  })
})

describe('2026_B01012 benchmark parity', () => {
  const read = (name: string) => JSON.parse(readFileSync(
    new URL(`../../data/releases/2026_B01012/${name}.json`, import.meta.url), 'utf8',
  ))
  const data = parseReleaseData(read('manifest'), read('rooms'), read('schedules'))
  const engine = new AvailabilityEngine(data.rooms, data.schedules, data.manifest)
  // Names/order/serialization are from bench/benchmark_search.py. Digests were
  // recomputed with the unmodified Python reference against this release.
  const queries = [
    { name: 'mon_all_0900', now: at(12, 9), wallClock: { day: '월', hour: 9, minute: 0 }, building: null, min: 0, count: 301, digest: '768c31378a99a5b6' },
    { name: 'mon_gongb_1520_60', now: at(12, 15, 20), wallClock: { day: '월', hour: 15, minute: 20 }, building: '공B', min: 60, count: 17, digest: 'fbcc591b09e2aaf3' },
    { name: 'mon_sae_1520_60', now: at(12, 15, 20), wallClock: { day: '월', hour: 15, minute: 20 }, building: '새', min: 60, count: 1, digest: 'f90c4400d79d796c' },
    { name: 'tue_all_1200_60', now: at(13, 12), wallClock: { day: '화', hour: 12, minute: 0 }, building: null, min: 60, count: 240, digest: '447c479d84f5b33b' },
    { name: 'wed_all_1330_60', now: at(14, 13, 30), wallClock: { day: '수', hour: 13, minute: 30 }, building: null, min: 60, count: 201, digest: 'df9b218e29fb7a49' },
    { name: 'wed_gongb_1330_120', now: at(14, 13, 30), wallClock: { day: '수', hour: 13, minute: 30 }, building: '공B', min: 120, count: 12, digest: '5ac2a377d035f4a0' },
    { name: 'thu_all_1600_90', now: at(15, 16), wallClock: { day: '목', hour: 16, minute: 0 }, building: null, min: 90, count: 219, digest: '45cda79a4b53bf3d' },
    { name: 'fri_all_1800_60', now: at(16, 18), wallClock: { day: '금', hour: 18, minute: 0 }, building: null, min: 60, count: 395, digest: 'f3c2e8a724965bc4' },
  ] as const
  const results = queries.map(query => ({
    ...query,
    roomIds: engine.findAvailableRooms(query.now, query.building, query.min).map(status => status.room_id).sort(),
  }))

  it.each(results)('$name matches count $count and Python room ID digest', query => {
    expect(engine.findAvailableRooms(query.now, query.building, query.min))
      .toEqual(engine.findAvailableRoomsAtWallClock(query.wallClock, query.building, query.min))
    expect(query.roomIds).toHaveLength(query.count)
    expect(createHash('sha256').update(query.roomIds.join('\n'), 'utf8').digest('hex').slice(0, 16))
      .toBe(query.digest)
  })

  it('matches Python combined digest 402da0886860a848', () => {
    const digest = createHash('sha256')
    for (const query of results) {
      digest.update(query.name, 'utf8')
      digest.update('\0')
      for (const roomId of query.roomIds) digest.update(`${roomId}\n`, 'utf8')
    }
    expect(digest.digest('hex').slice(0, 16)).toBe('402da0886860a848')
  })
})

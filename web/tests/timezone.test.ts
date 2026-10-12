import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Day, Manifest, Room, Schedule } from '../src/data'
import { AvailabilityEngine } from '../src/search'

const manifest = { timezone: 'Asia/Seoul' } as const
const rooms: Room[] = [{ id: '공B352', building: '공B', number: '352' }]
const schedules: Schedule[] = [
  { room: '공B352', day: '월', start_period: 4, end_period: 6 },
  { room: '공B352', day: '수', start_period: 11, end_period: 13 },
]

afterEach(() => vi.useRealTimers())

describe('manifest timezone and explicit campus wall clock', () => {
  const engine = new AvailabilityEngine(rooms, schedules, manifest)

  it('runs in the system timezone requested by test:timezones', () => {
    const expected = process.env.KUROOM_TEST_TIMEZONE
    if (expected) expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(expected)
    expect(engine.timezone).toBe(manifest.timezone)
  })

  it.each([
    '2026-10-14T04:30:59Z',
    '2026-10-13T21:30:59-07:00',
    '2026-10-14T00:30:59-04:00',
    '2026-10-14T13:30:59+09:00',
  ])('converts the same instant to Wednesday 13:30 in Seoul: %s', value => {
    const instant = new Date(value)
    expect(engine.toCampusWallClock(instant)).toEqual({ day: '수', hour: 13, minute: 30 })
    expect(engine.getCurrentStatus('공B352', instant))
      .toEqual(engine.getStatusAtWallClock('공B352', { day: '수', hour: 13, minute: 30 }))
    expect(engine.findAvailableRooms(instant, '공B', 30))
      .toEqual(engine.findAvailableRoomsAtWallClock({ day: '수', hour: 13, minute: 30 }, '공B', 30))
    expect(engine.findAvailableRooms(instant, '공B', 30)).toHaveLength(1)
  })

  it('changes weekday at Seoul midnight and represents midnight as hour zero', () => {
    expect(engine.toCampusWallClock(new Date('2026-10-11T14:59:59Z')))
      .toEqual({ day: '일', hour: 23, minute: 59 })
    expect(engine.toCampusWallClock(new Date('2026-10-11T15:00:00Z')))
      .toEqual({ day: '월', hour: 0, minute: 0 })
    expect(engine.getCurrentStatus('공B352', new Date('2026-10-11T15:00:00Z')).state)
      .toBe('outside_regular_hours')
  })

  it('uses the actual current instant when Date is omitted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T01:30:00Z'))
    expect(engine.getCurrentStatus('공B352').state).toBe('occupied')
    expect(engine.findAvailableRooms()).toEqual([])
    vi.setSystemTime(new Date('2026-10-14T04:30:00Z'))
    expect(engine.findAvailableRooms())
      .toEqual(engine.findAvailableRoomsAtWallClock({ day: '수', hour: 13, minute: 30 }))
  })

  it('takes a manual selection directly without converting an instant', () => {
    const convert = vi.spyOn(engine, 'toCampusWallClock')
    try {
      const status = engine.getStatusAtWallClock('공B352', { day: '수', hour: 13, minute: 30 })
      expect(status).toMatchObject({ day: '수', state: 'free_until', free_minutes: 30, free_until: '14:00' })
      expect(engine.findAvailableRoomsAtWallClock({ day: '수', hour: 13, minute: 30 }, '공B', 30))
        .toEqual([status])
      expect(convert).not.toHaveBeenCalled()
    } finally {
      convert.mockRestore()
    }
  })

  it('rejects invalid instants', () => {
    expect(() => engine.findAvailableRooms(new Date(NaN))).toThrow(/instant: 유효한 Date/)
    expect(() => engine.getCurrentStatus('공B352', new Date(NaN))).toThrow(/instant: 유효한 Date/)
  })

  it.each([
    { day: 'Wed' as Day, hour: 13, minute: 30 },
    { day: '수' as Day, hour: 24, minute: 0 },
    { day: '수' as Day, hour: 13.5, minute: 0 },
    { day: '수' as Day, hour: 13, minute: -1 },
    { day: '수' as Day, hour: 13, minute: 60 },
  ])('rejects invalid manual selections: %j', time => {
    expect(() => engine.getStatusAtWallClock('공B352', time)).toThrow(/campus wall-clock/)
    expect(() => new AvailabilityEngine([], [], manifest).findAvailableRoomsAtWallClock(time))
      .toThrow(/campus wall-clock/)
  })

  it('never falls back to the host timezone for a missing or unsupported manifest zone', () => {
    for (const timezone of [undefined, 'UTC']) {
      expect(() => new AvailabilityEngine(rooms, schedules, { timezone: timezone as Manifest['timezone'] }))
        .toThrow(/manifest.timezone/)
    }
  })
})

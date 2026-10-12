import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseReleaseData } from '../src/data'
import type { Day, Room, Schedule } from '../src/data'
import { AvailabilityEngine } from '../src/search'
import type { RoomStatus } from '../src/search'

interface Query { name: string; day: Day; hour: number; minute: number; min: number; building: string | null }
const query = (name: string, day: Day, hour: number, minute = 0, min = 0, building: string | null = null): Query =>
  ({ name, day, hour, minute, min, building })
const queries = [
  query('mon_all_0900', '월', 9),
  query('mon_gongb_1520_60', '월', 15, 20, 60, '공B'),
  query('mon_sae_1520_60', '월', 15, 20, 60, '새'),
  query('tue_all_1200_60', '화', 12, 0, 60),
  query('wed_all_1330_60', '수', 13, 30, 60),
  query('wed_gongb_1330_120', '수', 13, 30, 120, '공B'),
  query('thu_all_1600_90', '목', 16, 0, 90),
  query('fri_all_1800_60', '금', 18, 0, 60),
  query('mon_before_0800', '월', 8),
  query('mon_class_end_1200', '월', 12),
  query('mon_after_2030', '월', 20, 30),
  query('mon_night_2117', '월', 21, 17, 703),
  query('mon_night_min_704', '월', 21, 17, 704),
  query('fri_night_2117', '금', 21, 17, 3583),
  query('fri_night_min_3584', '금', 21, 17, 3584),
  query('wed_empty_day', '수', 8),
  query('sun_midnight', '일', 0),
  query('empty_week_only', '월', 21, 17, 100000),
]

const python = `
import json, sys
from datetime import datetime, timedelta
from availability import AvailabilityEngine
payload = json.load(sys.stdin)
engine = AvailabilityEngine(payload['rooms'], payload['schedules'])
days = ['월', '화', '수', '목', '금', '토', '일']
output = []
for q in payload['queries']:
    now = datetime(2026, 10, 12, q['hour'], q['minute']) + timedelta(days=days.index(q['day']))
    output.append({
        'statuses': [engine.get_current_status(room['id'], now) for room in payload['rooms']],
        'ids': [status['room_id'] for status in engine.find_available_rooms(now, q['building'], q['min'])],
    })
json.dump(output, sys.stdout, ensure_ascii=False)
`

const read = (name: string) => JSON.parse(readFileSync(
  new URL(`../../data/releases/2026_B01012/${name}.json`, import.meta.url), 'utf8',
))
const release = parseReleaseData(read('manifest'), read('rooms'), read('schedules'))
const rooms: Room[] = [
  { id: '공B155', building: '공B', number: '155' },
  { id: '공B170', building: '공B', number: '170' },
]
const schedules: Schedule[] = [
  { room: '공B155', day: '월', start_period: 1, end_period: 6 },
  { room: '공B155', day: '화', start_period: 1, end_period: 1 },
]

describe('live Python / TypeScript weekly parity', () => {
  it.each([
    { name: 'release (404 rooms)', rooms: release.rooms, schedules: release.schedules },
    { name: 'empty day/week and exact overnight minimum fixture', rooms, schedules },
  ])('$name: compares full statuses and ordered result IDs for 18 queries', source => {
    const expected: { statuses: RoomStatus[]; ids: string[] }[] = JSON.parse(execFileSync(
      process.env.PYTHON ?? 'python', ['-c', python], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        input: JSON.stringify({ ...source, queries }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      },
    ))
    const engine = new AvailabilityEngine(source.rooms, source.schedules, release.manifest)
    queries.forEach((q, index) => {
      expect(source.rooms.map(room => engine.getStatusAtWallClock(room.id, q)), q.name)
        .toEqual(expected[index].statuses)
      const ids = engine.findAvailableRoomsAtWallClock(q, q.building, q.min).map(status => status.room_id)
      expect(ids, q.name).toEqual(expected[index].ids)
    })
    // The full payload comparison above also covers durations and next-class
    // metadata, which a room-ID-only digest cannot detect.
  })
})

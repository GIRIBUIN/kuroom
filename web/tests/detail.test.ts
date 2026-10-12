import { describe, expect, it } from 'vitest'
import { timetableBlocks } from '../src/detail'
import { AvailabilityEngine } from '../src/search'
import type { Schedule } from '../src/data'

const room = { id: '공B155', building: '공B', number: '155' }
const base: Schedule = { room: room.id, day: '월', start_period: 1, end_period: 3, subject_name: '자료구조', professor: '김교수' }
const engine = (schedules: Schedule[]) => new AvailabilityEngine([room], schedules, { timezone: 'Asia/Seoul' })

describe('weekly timetable presentation', () => {
  it('converts inclusive periods and combines consecutive periods of the same subject and professor', () => {
    const source = [base, { ...base, start_period: 4, end_period: 6 }, { ...base, start_period: 8, end_period: 8 }]
    const search = engine(source)
    expect(timetableBlocks(search, room.id, '월')).toEqual([
      { day: '월', start: 540, end: 720, subject: '자료구조', professor: '김교수', lane: 0, lanes: 1 },
      { day: '월', start: 750, end: 780, subject: '자료구조', professor: '김교수', lane: 0, lanes: 1 },
    ])
    expect(search.getDaySchedules(room.id, '월')).toEqual(source)
    expect(timetableBlocks(search, room.id, '화')).toEqual([])
  })

  it('keeps different subjects/professors distinct and places overlapping classes side by side', () => {
    const blocks = timetableBlocks(engine([
      base,
      { ...base, start_period: 2, end_period: 4, subject_name: '운영체제' },
      { ...base, start_period: 4, end_period: 6, professor: '이교수' },
      { ...base, start_period: 7, end_period: 7, subject_name: undefined },
    ]), room.id, '월')
    expect(blocks.map(block => [block.start, block.end, block.lane, block.lanes])).toEqual([
      [540, 630, 0, 2], [570, 660, 1, 2], [630, 720, 0, 2], [720, 750, 0, 1],
    ])
  })

  it('allocates three overlapping courses entirely within the weekday column', () => {
    const blocks = timetableBlocks(engine([
      base, { ...base, subject_name: '운영체제' }, { ...base, subject_name: '열전달' },
    ]), room.id, '월')
    expect(blocks.map(block => block.lane)).toEqual([0, 1, 2])
    for (const block of blocks) {
      expect(block.lanes).toBe(3)
      expect(block.lane / block.lanes).toBeGreaterThanOrEqual(0)
      expect((block.lane + 1) / block.lanes).toBeLessThanOrEqual(1)
    }
  })
})

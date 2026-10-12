import { expect, it } from 'vitest'
import { buildingAnchors } from '../src/building-index'

it('takes first occurrences in result order without sorting, duplicates or mutation', () => {
  const rooms = [
    { id: '새502', building: '새', number: '502' },
    { id: '공B155', building: '공B', number: '155' },
    { id: '공B156', building: '공B', number: '156' },
    { id: '경영206', building: '경영', number: '206' },
    { id: '새503', building: '새', number: '503' },
  ]
  const before = structuredClone(rooms)
  expect(buildingAnchors(rooms)).toEqual([
    { building: '새', roomId: '새502' },
    { building: '공B', roomId: '공B155' },
    { building: '경영', roomId: '경영206' },
  ])
  expect(rooms).toEqual(before)
  expect(buildingAnchors([])).toEqual([])
})

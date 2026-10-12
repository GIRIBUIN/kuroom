import { describe, expect, it } from 'vitest'
import type { Room } from '../src/data'
import { addTarget, exactLookupTarget, isLookupMode, lookupCandidates, lookupRooms, removeTarget } from '../src/lookup'
import type { LookupTarget } from '../src/lookup'

const rooms: Room[] = [
  { id: '공B155', building: '공B', number: '155' },
  { id: '공B156', building: '공B', number: '156' },
  { id: '경영206', building: '경영', number: '206' },
  { id: '새502', building: '새', number: '502' },
  { id: '공A155', building: '공A', number: '155' },
]
const room = (value: string): LookupTarget => ({ kind: 'room', value })
const building = (value: string): LookupTarget => ({ kind: 'building', value })
const ids = (targets: LookupTarget[], query = '') => lookupRooms(rooms, { query, targets }).map(room => room.id)

describe('independent room/building lookup', () => {
  it('enters lookup only for a query or targets and returns to availability when both are cleared', () => {
    expect(isLookupMode({ query: '', targets: [] })).toBe(false)
    expect(isLookupMode({ query: ' \t ', targets: [] })).toBe(false)
    expect(isLookupMode({ query: '공', targets: [] })).toBe(true)
    expect(isLookupMode({ query: '', targets: [building('공B')] })).toBe(true)
    expect(isLookupMode({ query: '', targets: removeTarget([room('공B155')], room('공B155')) })).toBe(false)
  })

  it.each(['공B155', '공B 155', '  공 B \t 155  ', '공b155', '공ｂ１５５'])(
    'normalizes whitespace, Latin case and common full-width input: %s', query => {
      expect(ids([], query)).toEqual(['공B155'])
      expect(lookupCandidates(rooms, query, [])[0]).toMatchObject({ kind: 'room', value: '공B155' })
    },
  )

  it('supports partial room numbers, exact buildings, partial buildings and unknown rooms', () => {
    expect(ids([], '15')).toEqual(['공B155', '공B156', '공A155'])
    expect(ids([], '155')).toEqual(['공B155', '공A155'])
    expect(ids([], '공B')).toEqual(['공B155', '공B156'])
    expect(ids([], '경영')).toEqual(['경영206'])
    expect(ids([], '공')).toEqual(['공B155', '공B156', '공A155'])
    expect(ids([], '공B999')).toEqual([])
  })

  it('distinguishes building and room candidates, counts rooms and limits suggestions', () => {
    const candidates = lookupCandidates(rooms, '공', [])
    expect(candidates.slice(0, 2)).toEqual([
      { kind: 'building', value: '공B', label: '공B', roomCount: 2 },
      { kind: 'building', value: '공A', label: '공A', roomCount: 1 },
    ])
    expect(candidates.some(candidate => candidate.kind === 'room')).toBe(true)
    expect(lookupCandidates(rooms, '공', [], 2)).toHaveLength(2)
    const many = Array.from({ length: 20 }, (_, index) => ({ id: `공B${index}`, building: '공B', number: String(index) }))
    expect(lookupCandidates(many, '공B', [])).toHaveLength(8)
    expect(lookupCandidates(rooms, '', [])).toEqual([])
    expect(lookupCandidates(rooms, '없는건물', [])).toEqual([])
  })

  it.each([
    { targets: [room('경영206'), room('새502')], expected: ['경영206', '새502'] },
    { targets: [building('공B'), room('경영206')], expected: ['공B155', '공B156', '경영206'] },
    { targets: [building('공B'), building('새')], expected: ['공B155', '공B156', '새502'] },
    { targets: [building('공B'), room('공B155')], expected: ['공B155', '공B156'] },
  ])('unions targets and deduplicates rooms: $expected', ({ targets, expected }) => {
    expect(ids(targets)).toEqual(expected)
  })

  it('previews a typed query as a union without narrowing selected targets', () => {
    expect(ids([building('공B')], '경영206')).toEqual(['공B155', '공B156', '경영206'])
  })

  it('prevents duplicate tokens, excludes selected suggestions and removes individual tokens', () => {
    const selected = addTarget([building('공B')], room('공B155'))
    expect(addTarget(selected, room('공B155'))).toEqual(selected)
    expect(addTarget(selected, building('공B'))).toEqual(selected)
    expect(lookupCandidates(rooms, '공B', selected).map(candidate => candidate.value)).toEqual(['공B156'])
    expect(removeTarget(selected, building('공B'))).toEqual([room('공B155')])
    expect(removeTarget(selected, room('공B155'))).toEqual([building('공B')])
  })

  it('resolves only unique normalized exact matches across rooms and buildings', () => {
    expect(exactLookupTarget(rooms, ' 공B 155 ')).toMatchObject({ kind: 'room', value: '공B155' })
    expect(exactLookupTarget(rooms, ' 공 b ')).toMatchObject({ kind: 'building', value: '공B' })
    expect(exactLookupTarget(rooms, '공')).toBeUndefined()
    expect(exactLookupTarget(rooms, '155')).toBeUndefined()
    expect(exactLookupTarget(rooms, '없는방')).toBeUndefined()
    expect(exactLookupTarget([...rooms, { id: '공b155', building: '공b', number: '155' }], '공B155')).toBeUndefined()
  })
})

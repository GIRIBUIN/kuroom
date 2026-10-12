import type { Room } from './data'

export interface LookupTarget {
  kind: 'building' | 'room'
  value: string
}

export interface LookupState {
  query: string
  targets: LookupTarget[]
}

export interface LookupCandidate extends LookupTarget {
  label: string
  roomCount?: number
}

export const normalizeLookup = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase()
export const isLookupMode = (state: LookupState) => normalizeLookup(state.query) !== '' || state.targets.length > 0
export const targetKey = (target: LookupTarget) => `${target.kind}:${target.value}`

export function addTarget(targets: LookupTarget[], target: LookupTarget): LookupTarget[] {
  return targets.some(item => targetKey(item) === targetKey(target)) ? targets : [...targets, target]
}

export function removeTarget(targets: LookupTarget[], target: LookupTarget): LookupTarget[] {
  return targets.filter(item => targetKey(item) !== targetKey(target))
}

export const roomLabel = (room: Room) => [room.building, room.number].filter(Boolean).join(' ')

function matchesRoom(room: Room, query: string): boolean {
  return normalizeLookup(room.id).includes(query)
    || normalizeLookup(roomLabel(room)).includes(query)
}

/** Lookup uses the room catalog only, independently of every availability filter. */
export function lookupRooms(rooms: Room[], state: LookupState): Room[] {
  const query = normalizeLookup(state.query)
  const selected = new Set(state.targets.map(targetKey))
  const seen = new Set<string>()
  return rooms.filter(room => {
    const matches = selected.has(targetKey({ kind: 'room', value: room.id }))
      || selected.has(targetKey({ kind: 'building', value: room.building }))
      || (query !== '' && matchesRoom(room, query))
    if (!matches || seen.has(room.id)) return false
    seen.add(room.id)
    return true
  })
}

export function lookupCandidates(rooms: Room[], query: string, targets: LookupTarget[], limit = 8): LookupCandidate[] {
  const normalized = normalizeLookup(query)
  if (!normalized) return []
  const counts = new Map<string, number>()
  for (const room of rooms) counts.set(room.building, (counts.get(room.building) ?? 0) + 1)
  const selected = new Set(targets.map(targetKey))
  const candidates: LookupCandidate[] = [
    ...Array.from(counts, ([building, roomCount]) => ({ kind: 'building' as const, value: building, label: building, roomCount }))
      .filter(target => normalizeLookup(target.value).includes(normalized)),
    ...rooms.filter(room => matchesRoom(room, normalized))
      .map(room => ({ kind: 'room' as const, value: room.id, label: roomLabel(room) })),
  ].filter(target => !selected.has(targetKey(target)))
  const rank = (target: LookupCandidate) => {
    const value = normalizeLookup(target.value)
    return value === normalized ? 0 : value.startsWith(normalized) ? 1 : 2
  }
  // Exact matches first; building candidates precede rooms at the same rank.
  return candidates.sort((a, b) => rank(a) - rank(b)
    || Number(a.kind === 'room') - Number(b.kind === 'room')).slice(0, limit)
}

/** Resolve across the catalog, independently of the visible suggestion limit. */
export function exactLookupTarget(rooms: Room[], query: string): LookupCandidate | undefined {
  const normalized = normalizeLookup(query)
  if (!normalized) return undefined
  const exact = lookupCandidates(rooms, query, [], Infinity).filter(candidate =>
    normalizeLookup(candidate.value) === normalized || normalizeLookup(candidate.label) === normalized)
  return exact.length === 1 ? exact[0] : undefined
}

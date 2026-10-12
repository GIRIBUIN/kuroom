/** Runtime release format emitted by build_release.py (schema version 1). */
export const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
export type Day = (typeof DAYS)[number]

export interface Room {
  id: string
  building: string
  number: string
}

export interface Schedule {
  room: string
  day: Day
  start_period: number
  end_period: number
  subject_name?: string
  professor?: string
}

export interface Manifest {
  schema_version: 1
  university: string
  year: string
  term: string
  timezone: 'Asia/Seoul'
  generated_at: string
  time_grid: {
    day_start: '09:00'
    period_minutes: 30
    default_last_period: 19
  }
  room_count: number
  schedule_count: number
}

export interface ReleaseData {
  manifest: Manifest
  rooms: Room[]
  schedules: Schedule[]
}

function invalid(path: string, reason: string): never {
  throw new Error(`${path}: ${reason}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, '객체여야 합니다')
  }
  return value as Record<string, unknown>
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    invalid(path, allowEmpty ? '문자열이어야 합니다' : '비어 있지 않은 문자열이어야 합니다')
  }
  return value
}

function integer(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    invalid(path, `${minimum} 이상의 안전한 정수여야 합니다`)
  }
  return value
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, '배열이어야 합니다')
  return value
}

function parseManifest(value: unknown): Manifest {
  const path = 'manifest.json'
  const item = record(value, path)
  if (item.schema_version !== 1) {
    invalid(`${path}.schema_version`, `지원하지 않는 버전입니다 (${String(item.schema_version)}); 지원 버전: 1`)
  }
  const grid = record(item.time_grid, `${path}.time_grid`)
  // V0 mirrors periods.py; a different grid must not silently change its semantics.
  if (grid.day_start !== '09:00' || grid.period_minutes !== 30 || grid.default_last_period !== 19) {
    invalid(`${path}.time_grid`, 'V0는 day_start=09:00, period_minutes=30, default_last_period=19만 지원합니다')
  }
  if (item.timezone !== 'Asia/Seoul') {
    invalid(`${path}.timezone`, 'V0는 Asia/Seoul만 지원합니다')
  }
  const generatedAt = string(item.generated_at, `${path}.generated_at`)
  if (!Number.isFinite(Date.parse(generatedAt))) {
    invalid(`${path}.generated_at`, '유효한 날짜/시각이어야 합니다')
  }
  return {
    schema_version: 1,
    university: string(item.university, `${path}.university`),
    year: string(item.year, `${path}.year`),
    term: string(item.term, `${path}.term`),
    timezone: 'Asia/Seoul',
    generated_at: generatedAt,
    time_grid: { day_start: '09:00', period_minutes: 30, default_last_period: 19 },
    room_count: integer(item.room_count, `${path}.room_count`, 0),
    schedule_count: integer(item.schedule_count, `${path}.schedule_count`, 0),
  }
}

function parseRooms(value: unknown): Room[] {
  const ids = new Set<string>()
  return array(value, 'rooms.json').map((value, index) => {
    const path = `rooms.json[${index}]`
    const item = record(value, path)
    const id = string(item.id, `${path}.id`)
    if (ids.has(id)) invalid(`${path}.id`, `중복 강의실 ID입니다 (${id})`)
    ids.add(id)
    return {
      id,
      building: string(item.building, `${path}.building`),
      number: string(item.number, `${path}.number`, true),
    }
  })
}

function parseSchedules(value: unknown, rooms: Room[]): Schedule[] {
  const ids = new Set(rooms.map(room => room.id))
  return array(value, 'schedules.json').map((value, index) => {
    const path = `schedules.json[${index}]`
    const item = record(value, path)
    const room = string(item.room, `${path}.room`)
    if (!ids.has(room)) invalid(`${path}.room`, `rooms.json에 없는 강의실입니다 (${room})`)
    if (!DAYS.includes(item.day as Day)) invalid(`${path}.day`, '월~일 중 하나여야 합니다')
    const start = integer(item.start_period, `${path}.start_period`, 1)
    const end = integer(item.end_period, `${path}.end_period`, 1)
    if (start > end) invalid(path, 'start_period는 end_period 이하여야 합니다')
    const schedule: Schedule = { room, day: item.day as Day, start_period: start, end_period: end }
    for (const field of ['subject_name', 'professor'] as const) {
      if (field in item) schedule[field] = string(item[field], `${path}.${field}`, true)
    }
    return schedule
  })
}

/** Validates untrusted JSON without coercing or repairing it. */
export function parseReleaseData(manifest: unknown, rooms: unknown, schedules: unknown): ReleaseData {
  const parsedManifest = parseManifest(manifest)
  const parsedRooms = parseRooms(rooms)
  const parsedSchedules = parseSchedules(schedules, parsedRooms)
  for (const [file, expected, actual] of [
    ['rooms.json', parsedManifest.room_count, parsedRooms.length],
    ['schedules.json', parsedManifest.schedule_count, parsedSchedules.length],
  ] as const) {
    if (actual !== expected) invalid(file, `manifest 개수 불일치: 기대 ${expected}, 실제 ${actual}`)
  }
  return { manifest: parsedManifest, rooms: parsedRooms, schedules: parsedSchedules }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    throw new Error(`${url}: 데이터를 요청하지 못했습니다`, { cause })
  }
  if (!response.ok) invalid(url, `HTTP ${response.status} ${response.statusText}`)
  try {
    return await response.json()
  } catch (cause) {
    throw new Error(`${url}: JSON을 해석하지 못했습니다`, { cause })
  }
}

/** publicDir is data/releases, so the default URL has no /data/releases prefix. */
export async function loadReleaseData(
  releaseUrl = `${import.meta.env.BASE_URL}2026_B01012`,
): Promise<ReleaseData> {
  const base = releaseUrl.replace(/\/+$/, '')
  const manifest = parseManifest(await fetchJson(`${base}/manifest.json`))
  const [rooms, schedules] = await Promise.all([
    fetchJson(`${base}/rooms.json`),
    fetchJson(`${base}/schedules.json`),
  ])
  return parseReleaseData(manifest, rooms, schedules)
}

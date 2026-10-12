import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadReleaseData, parseReleaseData } from '../src/data'

function fixture() {
  const read = (name: string) => JSON.parse(readFileSync(
    new URL(`../../data/releases/2026_B01012/${name}.json`, import.meta.url), 'utf8',
  ))
  return { manifest: read('manifest'), rooms: read('rooms'), schedules: read('schedules') }
}

afterEach(() => vi.unstubAllGlobals())

describe('release validation', () => {
  it('loads the real release and verifies manifest counts', () => {
    const { manifest, rooms, schedules } = fixture()
    const data = parseReleaseData(manifest, rooms, schedules)
    expect(data.manifest.schema_version).toBe(1)
    expect(data.rooms).toHaveLength(404)
    expect(data.schedules).toHaveLength(3087)
    expect(data.rooms).toEqual(rooms)
    expect(data.schedules).toEqual(schedules)
  })

  it.each([
    ['schema_version', 2, /schema_version/],
    ['schema_version', '1', /schema_version/],
    ['room_count', 405, /rooms.json: manifest 개수 불일치: 기대 405, 실제 404/],
    ['schedule_count', 3086, /schedules.json: manifest 개수 불일치: 기대 3086, 실제 3087/],
    ['room_count', -1, /manifest.json.room_count/],
    ['schedule_count', 1.5, /manifest.json.schedule_count/],
    ['timezone', 'UTC', /manifest.json.timezone/],
    ['time_grid', { day_start: '08:00', period_minutes: 60, default_last_period: 19 }, /time_grid/],
    ['generated_at', 'invalid', /generated_at/],
  ])('rejects invalid manifest field %s=%j', (field, value, message) => {
    const { manifest, rooms, schedules } = fixture()
    expect(() => parseReleaseData({ ...manifest, [field]: value }, rooms, schedules)).toThrow(message)
  })

  it('rejects non-object manifests and non-array datasets', () => {
    const { manifest, rooms, schedules } = fixture()
    expect(() => parseReleaseData(null, rooms, schedules)).toThrow(/manifest.json: 객체/)
    expect(() => parseReleaseData(manifest, {}, schedules)).toThrow(/rooms.json: 배열/)
    expect(() => parseReleaseData(manifest, rooms, {})).toThrow(/schedules.json: 배열/)
  })

  it('rejects malformed and duplicate rooms', () => {
    const { manifest, rooms, schedules } = fixture()
    rooms[0].number = 202
    expect(() => parseReleaseData(manifest, rooms, schedules)).toThrow(/rooms.json\[0\].number/)
    rooms[0] = rooms[1]
    expect(() => parseReleaseData(manifest, rooms, schedules)).toThrow(/rooms.json\[1\].id: 중복/)
  })

  it.each([
    ['room', '없는강의실', /schedules.json\[0\].room/],
    ['day', 'Mon', /schedules.json\[0\].day/],
    ['start_period', 0, /schedules.json\[0\].start_period/],
    ['start_period', '13', /schedules.json\[0\].start_period/],
    ['end_period', 1.5, /schedules.json\[0\].end_period/],
    ['end_period', 1, /start_period는 end_period 이하/],
    ['subject_name', null, /schedules.json\[0\].subject_name/],
    ['professor', 42, /schedules.json\[0\].professor/],
  ])('rejects invalid schedule field %s=%j', (field, value, message) => {
    const { manifest, rooms, schedules } = fixture()
    schedules[0][field] = value
    expect(() => parseReleaseData(manifest, rooms, schedules)).toThrow(message)
  })
})

describe('HTTP loader', () => {
  function mockFetch() {
    const data = fixture()
    const mock = vi.fn(async (url: string) => {
      const file = url.split('/').at(-1)!.replace('.json', '') as keyof typeof data
      return new Response(JSON.stringify(data[file]))
    })
    vi.stubGlobal('fetch', mock)
    return { data, mock }
  }

  it('uses the Vite publicDir URL and fetches manifest first', async () => {
    const { mock } = mockFetch()
    await expect(loadReleaseData()).resolves.toMatchObject({ manifest: { room_count: 404 } })
    expect(mock.mock.calls.map(([url]) => url)).toEqual([
      '/2026_B01012/manifest.json', '/2026_B01012/rooms.json', '/2026_B01012/schedules.json',
    ])
  })

  it('accepts an explicit release URL with a trailing slash', async () => {
    const { mock } = mockFetch()
    await loadReleaseData('/app/2026_B01012/')
    expect(mock).toHaveBeenCalledWith('/app/2026_B01012/manifest.json')
    expect(mock).toHaveBeenCalledWith('/app/2026_B01012/schedules.json')
  })

  it('rejects unsupported manifests before requesting datasets', async () => {
    const { data, mock } = mockFetch()
    data.manifest.schema_version = 2
    await expect(loadReleaseData()).rejects.toThrow(/schema_version/)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it.each(['manifest', 'rooms', 'schedules'])('reports HTTP failures for %s.json', async file => {
    const { mock } = mockFetch()
    const success = mock.getMockImplementation()!
    mock.mockImplementation(async url => url.endsWith(`/${file}.json`)
      ? new Response('', { status: 404 }) : success(url))
    await expect(loadReleaseData()).rejects.toThrow(new RegExp(`${file}.json: HTTP 404`))
  })

  it('reports JSON parsing and network failures with the URL', async () => {
    const { mock } = mockFetch()
    mock.mockResolvedValue(new Response('<html>not JSON</html>'))
    await expect(loadReleaseData()).rejects.toThrow(/manifest.json: JSON/)
    mock.mockRejectedValue(new TypeError('offline'))
    await expect(loadReleaseData()).rejects.toThrow(/manifest.json: 데이터를 요청/)
  })
})

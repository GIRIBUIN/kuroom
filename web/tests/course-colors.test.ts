import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assignCourseColors, COURSE_COLOR_COUNT, courseColorIndex, courseIdentity } from '../src/course-colors'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
const themes = [
  { name: 'light', block: css.match(/:root \{([\s\S]*?)\n\}/)![1] },
  { name: 'dark', block: css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)![1] },
].map(({ name, block }) => ({ name, tokens: Object.fromEntries(
  [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/g)].map(match => [match[1], match[2]]),
) }))

function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
function contrast(a: string, b: string) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (high + .05) / (low + .05)
}

describe('deterministic course palette', () => {
  it('keeps Korean identities and assignments stable regardless of rendering order or repeats', () => {
    const courses = [
      { subject: '기계수치해석', professor: '김교수' },
      { subject: '열전달', professor: '이교수' },
      { subject: '자료구조', professor: '' },
      { subject: '기계수치해석', professor: '박교수' },
    ]
    const initial = assignCourseColors(courses)
    expect(assignCourseColors([...courses.toReversed(), courses[0]])).toEqual(initial)
    expect(initial.size).toBe(courses.length)
    expect(new Set(initial.values()).size).toBe(courses.length)
    expect(courseIdentity('자료구조')).toBe(courseIdentity('자료구조', ''))
    expect(courseIdentity('기계수치해석', '김교수')).not.toBe(courseIdentity('기계수치해석', '박교수'))
  })

  it('resolves preferred-index collisions in sorted identity order', () => {
    const a = { subject: '과목0', professor: '김교수' }
    const b = { ...a, subject: '과목8' }
    const preferred = courseColorIndex(a.subject, a.professor)
    expect(courseColorIndex(b.subject, b.professor)).toBe(preferred)
    const colors = assignCourseColors([b, a, b])
    expect(colors.get(courseIdentity(a.subject, a.professor))).toBe(preferred)
    expect(colors.get(courseIdentity(b.subject, b.professor))).toBe((preferred + 1) % COURSE_COLOR_COUNT)
    expect(assignCourseColors([a, b])).toEqual(colors)
  })

  it('wraps to the start of the palette when the last index is occupied', () => {
    const courses = Array.from({ length: 100 }, (_, index) => ({ subject: `과목${index}`, professor: '' }))
      .filter(course => courseColorIndex(course.subject, course.professor) === COURSE_COLOR_COUNT - 1).slice(0, 2)
    expect(courses).toHaveLength(2)
    expect([...assignCourseColors(courses).values()]).toEqual([COURSE_COLOR_COUNT - 1, 0])
  })

  it('never reuses colors while the palette is sufficient', () => {
    for (let count = 1; count <= COURSE_COLOR_COUNT; count++) {
      const courses = Array.from({ length: count }, (_, index) => ({ subject: `과목${index * 8}`, professor: '' }))
      expect(new Set(assignCourseColors(courses).values()).size).toBe(count)
    }
    expect(assignCourseColors([]).size).toBe(0)
  })

  it('only reuses colors after exhaustion and keeps every assignment in range', () => {
    const courses = Array.from({ length: 100 }, (_, index) => ({
      subject: index ? `과목 ${index}` : '', professor: index % 2 ? '교수' : '',
    }))
    const colors = assignCourseColors(courses)
    expect(colors.size).toBe(courses.length)
    expect(new Set([...colors.values()].slice(0, COURSE_COLOR_COUNT)).size).toBe(COURSE_COLOR_COUNT)
    expect(new Set(colors.values()).size).toBe(COURSE_COLOR_COUNT)
    expect(assignCourseColors(courses.toReversed())).toEqual(colors)
    for (const [key, hue] of colors) {
      expect(Number.isInteger(hue) && hue >= 0 && hue < COURSE_COLOR_COUNT).toBe(true)
      // Once exhausted, later identities reuse their own preferred hue.
      if ([...colors.keys()].indexOf(key) >= COURSE_COLOR_COUNT) {
        const [subject, professor] = key.split('\u0000')
        expect(hue).toBe(courseColorIndex(subject, professor))
      }
    }
  })

  it('uses the same DOM hue index for both light and dark palette variants', () => {
    for (let index = 0; index < COURSE_COLOR_COUNT; index++) {
      expect(css).toContain(`[data-course-color="${index}"] { --course-bg: var(--course-${index}-bg);`)
      for (const { tokens } of themes) {
        expect(tokens[`--course-${index}-bg`]).toBeDefined()
        expect(tokens[`--course-${index}-border`]).toBeDefined()
      }
    }
  })

  it.each(themes)('$name text and muted text meet 4.5:1 contrast on course and UI surfaces', ({ tokens }) => {
    for (let index = 0; index < COURSE_COLOR_COUNT; index++) {
      for (const foreground of ['--course-text', '--course-muted']) {
        expect(contrast(tokens[foreground], tokens[`--course-${index}-bg`])).toBeGreaterThanOrEqual(4.5)
      }
    }
    for (const background of ['--bg', '--surface', '--surface-muted', '--surface-hover', '--accent-soft']) {
      for (const foreground of ['--text', '--text-secondary', '--muted', '--accent']) {
        expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(tokens['--focus'], tokens[background])).toBeGreaterThanOrEqual(3)
    }
    expect(contrast(tokens['--theme-hover-text'], tokens['--theme-hover-bg'])).toBeGreaterThanOrEqual(4.5)
  })
})

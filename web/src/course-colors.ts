export const COURSE_COLOR_COUNT = 8

/** Without section IDs, equally named courses with the same professor share an identity. */
export const courseIdentity = (subjectName = '', professor = '') => `${subjectName}\u0000${professor}`

function preferredIndex(identity: string): number {
  // FNV-1a over UTF-16 code units: stable across rooms, order and reloads.
  let hash = 2166136261
  for (let index = 0; index < identity.length; index++) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0
  }
  return hash % COURSE_COLOR_COUNT
}

/** Preferred hue only; use assignCourseColors to resolve timetable collisions. */
export const courseColorIndex = (subjectName = '', professor = '') => preferredIndex(courseIdentity(subjectName, professor))

/** Allocate across the entire timetable, independently of day/render order.
 * Only reuse a preferred hue once every palette index has been allocated. */
export function assignCourseColors(courses: readonly { subject: string; professor: string }[]): Map<string, number> {
  const keys = [...new Set(courses.map(course => courseIdentity(course.subject, course.professor)))].sort()
  const colors = new Map<string, number>()
  const used = new Set<number>()
  for (const key of keys) {
    let index = preferredIndex(key)
    if (used.size < COURSE_COLOR_COUNT) {
      while (used.has(index)) index = (index + 1) % COURSE_COLOR_COUNT
    }
    colors.set(key, index)
    used.add(index)
  }
  return colors
}

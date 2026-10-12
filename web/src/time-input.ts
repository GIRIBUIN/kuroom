/** UI helpers only. Search and URL state still receive canonical HH:mm. */
export const sanitizeNumericInput = (value: string) => value.replace(/[^0-9]/g, '')

export function normalizeTimeSegments(hour: string, minute: string): string | null {
  const hh = sanitizeNumericInput(hour).slice(0, 2)
  const mm = sanitizeNumericInput(minute).slice(0, 2)
  // A missing hour stays incomplete; a missing minute can default to 00.
  if (!hh) return null
  const normalizedHour = Number(hh) >= 24 ? 0 : Number(hh)
  const normalizedMinute = Math.min(Number(mm || '0'), 59)
  return `${String(normalizedHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`
}

export function parseTimePaste(value: string): string | null {
  const text = value.replace(/[^0-9:]/g, '')
  if (text.includes(':')) {
    const [hour, minute] = text.split(':')
    return normalizeTimeSegments(hour, minute)
  }
  const digits = text.slice(0, 4)
  return digits.length <= 2 ? normalizeTimeSegments(digits, '')
    : normalizeTimeSegments(digits.slice(0, -2), digits.slice(-2))
}

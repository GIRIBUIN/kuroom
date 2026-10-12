import { expect, it } from 'vitest'
import { normalizeTimeSegments, parseTimePaste, sanitizeNumericInput } from '../src/time-input'

it.each([
  ['9', '09:00'], ['09', '09:00'], ['930', '09:30'], ['0930', '09:30'],
  ['1330', '13:30'], ['2359', '23:59'], ['09:30', '09:30'],
  ['0', '00:00'], ['000', '00:00'], [' 1330 ', '13:30'],
  ['9:30', '09:30'], ['-930', '09:30'], ['ab09:30', '09:30'],
])('distributes paste %s to the 24-hour clock %s', (input, expected) => {
  expect(parseTimePaste(input)).toBe(expected)
})

it.each([
  ['23', '59', '23:59'], ['24', '00', '00:00'], ['24', '30', '00:30'],
  ['29', '15', '00:15'], ['12', '60', '12:59'], ['23', '99', '23:59'],
  ['29', '99', '00:59'], ['9', '', '09:00'], ['23', '', '23:00'],
])('normalizes independent segments %s:%s to %s without carry', (hour, minute, expected) => {
  expect(normalizeTimeSegments(hour, minute)).toBe(expected)
})

it.each(['', ' ', 'abc'])('keeps an empty paste empty: %s', value => expect(parseTimePaste(value)).toBeNull())
it('does not invent an hour for missing or empty segments', () => {
  expect(normalizeTimeSegments('', '')).toBeNull()
  expect(normalizeTimeSegments('', '30')).toBeNull()
})
it('only retains ASCII digits', () => expect(sanitizeNumericInput('-+e.09:30한글')).toBe('0930'))

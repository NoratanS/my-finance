import { expect, test } from 'vitest'
import { matchesSearch } from '@/lib/search'

test('a search matches ignoring case and Polish letters, ł included', () => {
  expect(matchesSearch('Żabka', 'zab')).toBe(true)
  expect(matchesSearch('ŁÓDŹ trip', 'lodz')).toBe(true)
  expect(matchesSearch('Małe zakupy', 'MALE')).toBe(true)
  expect(matchesSearch('Zabka', 'żab')).toBe(true)
  expect(matchesSearch('Rent', 'zab')).toBe(false)
})

test('a blank search matches everything', () => {
  expect(matchesSearch('Rent', '   ')).toBe(true)
})

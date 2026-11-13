import { expect, test } from 'vitest'
import { dismissesSheet } from '@/components/ui/useSheetDrag'

test('a slow drag past half the sheet dismisses it', () => {
  expect(dismissesSheet({ distance: 400, velocity: 0, height: 700 })).toBe(true)
})

test('a slow drag short of half the sheet springs back', () => {
  expect(dismissesSheet({ distance: 300, velocity: 0, height: 700 })).toBe(
    false,
  )
})

test('a quick flick dismisses from a short distance', () => {
  expect(dismissesSheet({ distance: 60, velocity: 1200, height: 700 })).toBe(
    true,
  )
})

test('a flick back up keeps the sheet open', () => {
  expect(dismissesSheet({ distance: 400, velocity: -1200, height: 700 })).toBe(
    false,
  )
})

test('a short sheet still needs a deliberate drag', () => {
  expect(dismissesSheet({ distance: 50, velocity: 0, height: 80 })).toBe(false)
})

import { expect, test } from 'vitest'
import { formatAmount, formatAmountInput, parseAmount } from '@/lib/money'

// Plain spaces (U+0020), as the boards write them; Testing Library can't tell them from NBSP, so this pins it.
test('an amount reads with space thousands, a comma decimal and the currency after', () => {
  expect(formatAmount(220000, 'PLN')).toBe('2 200,00 PLN')
  expect(formatAmount(8420, 'EUR')).toBe('84,20 EUR')
  expect(formatAmount(5, 'PLN')).toBe('0,05 PLN')
  expect(formatAmount(99_999_999_999, 'PLN')).toBe('999 999 999,99 PLN')
})

test('income reads with a plus and an expense with a minus sign', () => {
  expect(formatAmount(820000, 'PLN', 'income')).toBe('+8 200,00 PLN')
  expect(formatAmount(8640, 'PLN', 'expense')).toBe('−86,40 PLN')
})

test('the amount field shows a typed amount the way it reads, without the currency', () => {
  expect(formatAmountInput(8420)).toBe('84,20')
  expect(formatAmountInput(123456789)).toBe('1 234 567,89')
})

test('a typed amount becomes minor units, with a comma or a dot', () => {
  expect(parseAmount('84,20')).toEqual({ minor: 8420 })
  expect(parseAmount('84.2')).toEqual({ minor: 8420 })
  expect(parseAmount(' 2 200 ')).toEqual({ minor: 220000 })
  expect(parseAmount('0,07')).toEqual({ minor: 7 })
  expect(parseAmount('999 999 999,99')).toEqual({ minor: 99_999_999_999 })
})

// 0.29 * 100 is 28.999999999999996 in floats; strings keep it exact.
test('a typed amount never goes through float maths', () => {
  expect(parseAmount('0,29')).toEqual({ minor: 29 })
  expect(parseAmount('1,13')).toEqual({ minor: 113 })
})

test('a typed amount that can’t be recorded names the problem', () => {
  expect(parseAmount('-84,20')).toEqual({ problem: 'minus' })
  expect(parseAmount('−84,20')).toEqual({ problem: 'minus' })
  expect(parseAmount('12,4,0')).toEqual({ problem: 'notANumber' })
  expect(parseAmount('84,205')).toEqual({ problem: 'notANumber' })
  expect(parseAmount('abc')).toEqual({ problem: 'notANumber' })
  expect(parseAmount('')).toEqual({ problem: 'notPositive' })
  expect(parseAmount('0,00')).toEqual({ problem: 'notPositive' })
  expect(parseAmount('1 000 000 000')).toEqual({ problem: 'tooLarge' })
  expect(parseAmount('99999999999999999999')).toEqual({ problem: 'tooLarge' })
})

import { describe, expect, test } from 'vitest';
import { editableAmount, parseAmount } from './money';

// The one amount rule every money form uses. It mirrors the server's
// (@DecimalMin(0, exclusive) + @Digits(15, 4)), so a parsed amount never draws an
// amount violation and a malformed one never reaches the server.

const SHAPE = 'Use digits with an optional decimal part, e.g. 12.50 or 12,50';

describe('parseAmount', () => {
  test.each([
    ['', { message: 'Enter an amount' }],
    ['   ', { message: 'Enter an amount' }],
    ['12', { amount: '12' }],
    [' 12.50 ', { amount: '12.50' }],
    ['12,5', { amount: '12.5' }],
    ['0,0001', { amount: '0.0001' }],
    ['12.50000', { message: 'Use at most 4 decimal places' }],
    ['0', { message: 'Must be greater than zero' }],
    ['0.00', { message: 'Must be greater than zero' }],
    ['0,0000', { message: 'Must be greater than zero' }],
    ['-1', { message: SHAPE }],
    ['+1', { message: SHAPE }],
    ['1e3', { message: SHAPE }],
    ['.5', { message: SHAPE }],
    ['5.', { message: SHAPE }],
    ['1 500', { message: SHAPE }],
    ['1.500,00', { message: SHAPE }],
    ['1,500.00', { message: SHAPE }],
    ['1,234,56', { message: SHAPE }],
    ['١٢', { message: SHAPE }],
    ['1234567890123456', { message: 'Use at most 15 digits before the decimal separator' }],
    ['123456789012345.1234', { amount: '123456789012345.1234' }],
    ['007', { amount: '007' }],
  ])('%j -> %j', (entered, expected) => {
    expect(parseAmount(entered)).toEqual(expected);
  });
});

describe('editableAmount', () => {
  test.each([
    ['1500.5000', '1500.5'],
    ['10.0000', '10'],
    ['0.1000', '0.1'],
    ['1234.5670', '1234.567'],
    ['100', '100'],
    ['29.99', '29.99'],
  ])('%j -> %j', (amount, expected) => {
    expect(editableAmount(amount)).toBe(expected);
  });
});

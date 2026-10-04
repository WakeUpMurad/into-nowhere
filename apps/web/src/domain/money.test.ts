import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from './money';

describe('payment amount parsing', () => {
  it('accepts the decimal comma without rounding errors', () => {
    expect(parseAmount('12,50')).toBe(1250n);
    expect(parseAmount('1.01')).toBe(101n);
  });
  it('rejects ambiguous, negative and over-precision values', () => {
    for (const value of ['', '-1', '1.001', '1e6', 'NaN', '1,2.3']) expect(parseAmount(value)).toBeNull();
  });
  it('keeps large values exact and preserves cents', () => {
    expect(parseAmount('999999999999999999.99')).toBe(99999999999999999999n);
    expect(formatAmount(100000001n)).toBe('$1\u2009000\u2009000.01');
  });
});

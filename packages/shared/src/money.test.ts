import { describe, expect, it } from 'vitest';
import { CURRENCIES, getCurrency } from './currencies';
import { formatMoney, fromMinor, toMinor } from './money';
import { signUpSchema } from './schemas/auth';

describe('currency table', () => {
  it('has the right minor digits', () => {
    expect(getCurrency('AED').digits).toBe(2);
    expect(getCurrency('JPY').digits).toBe(0);
    expect(getCurrency('KWD').digits).toBe(3);
    expect(getCurrency('inr').code).toBe('INR');
  });
  it('has unique codes', () => {
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
  });
  it('rejects unknown codes', () => {
    expect(() => getCurrency('XYZ')).toThrow();
  });
});

describe('toMinor', () => {
  it('converts per currency digits', () => {
    expect(toMinor('12.34', 'AED')).toBe(1234);
    expect(toMinor('1500', 'JPY')).toBe(1500);
    expect(toMinor('1.234', 'KWD')).toBe(1234);
  });
  it('rounds half-up away from zero', () => {
    expect(toMinor('0.005', 'AED')).toBe(1);
    expect(toMinor('0.004', 'AED')).toBe(0);
    expect(toMinor('-0.005', 'AED')).toBe(-1);
    expect(toMinor('2.5', 'JPY')).toBe(3);
    expect(toMinor('1.2345', 'KWD')).toBe(1235);
  });
  it('avoids float errors', () => {
    expect(toMinor('0.1', 'AED') + toMinor('0.2', 'AED')).toBe(30);
    expect(toMinor('1.005', 'AED')).toBe(101); // float maths gives 100
  });
  it('rejects malformed input', () => {
    for (const bad of ['', 'abc', '1,000', '1e5', '.5', '1.', 'NaN']) {
      expect(() => toMinor(bad, 'AED')).toThrow();
    }
  });
});

describe('fromMinor', () => {
  it('round-trips', () => {
    expect(fromMinor(1234, 'AED')).toBe('12.34');
    expect(fromMinor(5, 'AED')).toBe('0.05');
    expect(fromMinor(-1234, 'KWD')).toBe('-1.234');
    expect(fromMinor(1500, 'JPY')).toBe('1500');
    expect(toMinor(fromMinor(987654321, 'INR'), 'INR')).toBe(987654321);
  });
  it('rejects non-integers', () => {
    expect(() => fromMinor(1.5, 'AED')).toThrow();
  });
});

describe('formatMoney', () => {
  it('formats with grouping and digits', () => {
    expect(formatMoney(123450, 'AED')).toMatch(/1,234\.50/);
    expect(formatMoney(1500, 'JPY')).toMatch(/1,500/);
    expect(formatMoney(1500, 'JPY')).not.toMatch(/\./);
  });
});

describe('signUpSchema', () => {
  it('defaults base currency to AED and normalises email', () => {
    const r = signUpSchema.parse({ email: ' Jerome@Example.com ', password: 'secret123' });
    expect(r).toEqual({ email: 'jerome@example.com', password: 'secret123', baseCurrency: 'AED' });
  });
  it('rejects an unknown currency', () => {
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'secret123', baseCurrency: 'ZZZ' }).success).toBe(false);
  });
});

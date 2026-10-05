// All amounts stay in whole cents; never use floating-point values for payment amounts.
export function parseAmount(value: string): bigint | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || normalized.length > 1000) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function formatAmount(cents: bigint, currency: 'USD' | 'AZN' = 'USD'): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  const fraction = cents % 100n;
  const value = `${whole}${fraction === 0n ? '' : `.${fraction.toString().padStart(2, '0')}`}`;
  return currency === 'USD' ? `$${value}` : `${value} ₼`;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPayment, isTrustedCheckoutUrl, readPayment, resolveApiBaseUrl, TON_RECIPIENT_ADDRESS, validatePaymentOrder, validatePublicConfig, type TonPaymentOrder } from './api';

export const tonFixture: TonPaymentOrder = {
  orderId: 'order_12345678901234567890', checkoutUrl: null, status: 'pending', amountMinor: '101', currency: 'USD',
  charityQuarterMinor: '101', confirmation: null, amountNanoTON: '123456789', charityQuarterNanoTON: '123456789',
  recipientAddress: TON_RECIPIENT_ADDRESS, comment: 'INW-0123456789abcdef0123456789abcdef',
  expiresAt: '2026-10-05T12:10:00.000Z', validUntil: 1791201900, quoteUsd: '8.181',
  quotedAt: '2026-10-05T12:00:00.000Z', transactionHash: null,
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('payment API boundaries', () => {
  it('accepts only approved public TON configuration and preserves exact amount limits', () => {
    const config = { mode: 'live', currency: 'USD', minAmountMinor: 100, maxAmountMinor: '99999999999999999999', paymentsEnabled: true, paymentMethods: ['ton'], charitySharePercent: 25, merchantName: 'Into Nowhere', supportEmail: 'owner@example.com', provider: 'ton', recipientAddress: TON_RECIPIENT_ADDRESS };
    expect(validatePublicConfig(config).maxAmountMinor).toBe(config.maxAmountMinor);
    expect(() => validatePublicConfig({ ...config, recipientAddress: 'another-wallet' })).toThrow();
    expect(() => validatePublicConfig({ ...config, paymentMethods: ['ton', 'apple'] })).toThrow();
    expect(() => validatePublicConfig({ ...config, mode: 'demo' })).toThrow();
  });

  it('rejects a claimed paid order without blockchain confirmation and an actual transaction hash', () => {
    expect(() => validatePaymentOrder({ ...tonFixture, status: 'paid' })).toThrow();
    expect(() => validatePaymentOrder({ ...tonFixture, status: 'paid', confirmation: 'blockchain' })).toThrow();
    expect(validatePaymentOrder({ ...tonFixture, status: 'paid', confirmation: 'blockchain', transactionHash: 'a'.repeat(64) }).status).toBe('paid');
    expect(() => validatePaymentOrder({ ...tonFixture, charityQuarterNanoTON: '1' })).toThrow();
    expect(() => validatePaymentOrder({ ...tonFixture, amountNanoTON: '1e9' })).toThrow();
  });

  it('refuses insecure external API origins and deceptive checkout domains', () => {
    expect(resolveApiBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(resolveApiBaseUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    for (const origin of ['http://example.com', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com?token=secret']) expect(() => resolveApiBaseUrl(origin)).toThrow();
    expect(isTrustedCheckoutUrl('https://epoint.az/checkout')).toBe(true);
    for (const url of ['https://epoint.az.evil.example/checkout', 'https://epoint.az@evil.example/checkout', 'http://epoint.az/checkout', 'javascript:alert(1)']) expect(isTrustedCheckoutUrl(url)).toBe(false);
  });

  it('keeps GitHub Pages unable to create or query real payments', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'github-pages');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(createPayment({ amountMinor: '100', currency: 'USD', intention: 'gratitude', locale: 'en' }, 'a'.repeat(43))).rejects.toThrow('disabled');
    await expect(readPayment({ orderId: tonFixture.orderId, readToken: 'b'.repeat(43) })).rejects.toThrow('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a bearer receipt in a header, never in the request URL', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', ''); vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => tonFixture }); vi.stubGlobal('fetch', fetchMock);
    const token = 'c'.repeat(43);
    await readPayment({ orderId: tonFixture.orderId, readToken: token });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.example.com/api/payments/${tonFixture.orderId}`);
    expect(fetchMock.mock.calls[0][0]).not.toContain(token);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  });
});

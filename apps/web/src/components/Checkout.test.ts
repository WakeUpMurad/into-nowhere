import { Cell } from '@ton/core';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import { TON_RECIPIENT_ADDRESS, type TonPaymentOrder } from '../api';
import { buildTonTransaction, formatNanoTON, newPaymentKey, paymentPollDelay, receiptFromFragment } from './Checkout';

const quote: TonPaymentOrder = {
  orderId: 'order_12345678901234567890', checkoutUrl: null, status: 'pending', amountMinor: '101', currency: 'USD',
  charityQuarterMinor: '101', confirmation: null, amountNanoTON: '123456789', charityQuarterNanoTON: '123456789',
  recipientAddress: TON_RECIPIENT_ADDRESS, comment: 'INW-0123456789abcdef0123456789abcdef',
  expiresAt: '2026-10-05T12:10:00.000Z', validUntil: Math.floor(Date.parse('2026-10-05T12:05:00Z') / 1000),
  quoteUsd: '8.181', transactionHash: null,
};

describe('TON checkout', () => {
  it('builds one mainnet message with the exact non-bounceable recipient, nano amount and encoded comment', () => {
    const request = buildTonTransaction(quote, Date.parse('2026-10-05T12:00:00Z'));
    expect(request.network).toBe('-239');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].address).toBe(TON_RECIPIENT_ADDRESS);
    expect(request.messages[0].amount).toBe('123456789');
    const payload = Cell.fromBoc(Buffer.from(request.messages[0].payload, 'base64'))[0].beginParse();
    expect(payload.loadUint(32)).toBe(0);
    expect(payload.loadStringTail()).toBe(quote.comment);
  });

  it('refuses expired, already paid and substituted-recipient transfers', () => {
    expect(() => buildTonTransaction(quote, Date.parse('2026-10-05T12:06:00Z'))).toThrow();
    expect(() => buildTonTransaction({ ...quote, status: 'paid', confirmation: 'blockchain', transactionHash: 'a'.repeat(64) }, Date.parse('2026-10-05T12:00:00Z'))).toThrow();
    expect(() => buildTonTransaction({ ...quote, recipientAddress: 'another-wallet' }, Date.parse('2026-10-05T12:00:00Z'))).toThrow();
  });

  it('parses only a complete receipt, never a success flag or duplicated credentials', () => {
    const token = 'a'.repeat(43);
    expect(receiptFromFragment(`#payment=${quote.orderId}&token=${token}&status=paid`)).toEqual({ orderId: quote.orderId, readToken: token });
    expect(receiptFromFragment('#status=paid')).toBeNull();
    expect(receiptFromFragment(`#payment=${quote.orderId}&token=short`)).toBeNull();
    expect(receiptFromFragment(`#payment=${quote.orderId}&token=${token}&token=${token}`)).toBeNull();
  });

  it('formats nano amounts without floating point and uses slower bounded-poll intervals', () => {
    expect(formatNanoTON('1')).toBe('0.000000001');
    expect(formatNanoTON('1000000000')).toBe('1');
    expect(formatNanoTON('123456789012345678901')).toBe('123456789012.345678901');
    expect([0, 30_000, 90_000].map(paymentPollDelay)).toEqual([2000, 5000, 10_000]);
    expect(newPaymentKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newPaymentKey()).not.toBe(newPaymentKey());
  });
});

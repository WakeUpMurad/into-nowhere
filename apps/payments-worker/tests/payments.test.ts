import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { URL as NodeURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { beginCell } from '@ton/core';
import { handleRequest, matchingTransaction, parseExactJSON, quoteNanoTon, reconcilePayments, recipientReady, transactionComment, type Env, type PaymentOrder } from '../src/index';

const NOW = 1_790_000_000;
const address = 'UQDwlMjt0fw1LHrUdj8wV4tHOZ-Y5NQEAVgp49F7oJfQpJU6';
const raw = '0:f094c8edd1fc352c7ad4763f30578b47399f98e4d404015829e3d17ba097d0a4';
const secretKey = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12';
let miniflare: Miniflare;
let env: Env;

function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }

function deps(now = NOW, transactions: unknown[] = []) {
  return {
    now: () => now,
    fetcher: (async (input: RequestInfo | URL) => String(input).startsWith('https://api.coingecko.com/')
      ? response({ 'the-open-network': { usd: 2, last_updated_at: now } })
      : response({ transactions })) as typeof fetch,
  };
}

function createRequest(key = secretKey, amount = '101'): Request {
  return new Request('https://release.example/api/payments/create', {
    method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ amountMinor: amount, currency: 'USD', intention: 'gratitude', locale: 'en' }),
  });
}

async function create(now = NOW, key = secretKey): Promise<Record<string, unknown>> {
  const result = await handleRequest(createRequest(key), env, deps(now));
  expect([200, 201]).toContain(result.status);
  return await result.json() as Record<string, unknown>;
}

async function stored(orderId: unknown): Promise<PaymentOrder> {
  const order = await env.DB!.prepare('SELECT * FROM payment_orders WHERE id=?').bind(orderId).first<PaymentOrder>();
  expect(order).toBeTruthy(); return order!;
}

function transaction(order: PaymentOrder, changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hash: 'a'.repeat(64), lt: '9007199254740993', account: { address: raw }, success: true, aborted: false,
    utime: NOW - 40, transaction_type: 'TransOrd', orig_status: 'active', end_status: 'active', destroyed: false,
    in_msg: { msg_type: 'int_msg', bounce: false, bounced: false, destination: { address: raw }, value: order.amount_nano_ton,
      op_code: '0x00000000', decoded_op_name: 'text_comment', decoded_body: { text: order.comment } },
    ...changes,
  };
}

beforeAll(async () => {
  miniflare = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("OK") } }',
    compatibilityDate: '2026-10-05', d1Databases: { DB: 'payments-test' } }));
  const db = await miniflare.getD1Database('DB');
  env = { DB: db as unknown as D1Database, PAYMENTS_ENABLED: 'true', TON_RECIPIENT: address, TON_RECIPIENT_RAW: raw,
    MERCHANT_NAME: 'Into Nowhere', SUPPORT_EMAIL: 'support@release.example' };
  const migration = await readFile(new NodeURL('../migrations/0001.sql', import.meta.url), 'utf8');
  await env.DB!.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => env.DB!.prepare(sql)));
}, 20000);

beforeEach(async () => { await env.DB!.batch([env.DB!.prepare('DELETE FROM payment_orders'), env.DB!.prepare('DELETE FROM payment_service_state')]); });
afterAll(async () => { await miniflare?.dispose(); });

describe('exact quotes and recipient', () => {
  it('rounds native TON upward without floating point', () => {
    expect(quoteNanoTon('100', '2')).toBe('500000000');
    expect(quoteNanoTon('100', '3')).toBe('333333334');
    expect(quoteNanoTon('101', '2')).toBe('505000000');
    expect(quoteNanoTon('999999999999999999999999999999', '1')).toBe('9999999999999999999999999999990000000');
    for (const price of ['0', '-1', '1e2', 'NaN']) expect(() => quoteNanoTon('100', price)).toThrow();
  });
  it('preserves exact JSON numeric tokens and quoted strings', () => {
    expect(parseExactJSON('{"lt":9007199254740993,"usd":1.123456789012345678,"text":"00123 \\"USD\\""}'))
      .toEqual({ lt: '9007199254740993', usd: '1.123456789012345678', text: '00123 "USD"' });
    expect(() => parseExactJSON('{"value":01}')).toThrow();
  });
  it('requires an enabled mainnet receiver matching its raw address', async () => {
    expect(recipientReady(env)).toBe(true);
    for (const change of [{ PAYMENTS_ENABLED: 'false' }, { TON_RECIPIENT_RAW: '0:' + '0'.repeat(64) }, { DB: undefined }]) {
      const disabled = { ...env, ...change };
      expect(recipientReady(disabled)).toBe(false);
      const result = await handleRequest(createRequest(), disabled, deps());
      expect(result.status).toBe(503);
    }
    expect((await env.DB!.prepare('SELECT COUNT(*) AS count FROM payment_orders').first<{ count: number }>())?.count).toBe(0);
  });
});

describe('durable checkout and receipt capability', () => {
  it('allows a voluntary large amount while honoring an optional merchant limit', async () => {
    const config = await handleRequest(new Request('https://release.example/api/config'), env, deps());
    expect((await config.json() as Record<string, unknown>).maxAmountMinor).toBeNull();
    const large = await handleRequest(createRequest(secretKey, '1000001'), env, deps());
    expect(large.status).toBe(201);
    const capped = await handleRequest(createRequest('12345678-1234-4234-8234-123456789abc', '1000001'), { ...env, PAYMENT_MAX_AMOUNT_MINOR: '1000000' }, deps());
    expect(capped.status).toBe(400);
  });
  it('keeps retries identical and stores only token and idempotency hashes', async () => {
    const first = await create();
    const retry = await create();
    expect(retry.orderId).toBe(first.orderId);
    expect(retry.readToken).toBe(first.readToken);
    expect(first.status).toBe('pending'); expect(first.confirmation).toBeNull();
    expect(first.amountNanoTON).toBe('505000000'); expect(first.charityQuarterNanoTON).toBe('505000000');
    expect(first.validUntil).toBe(NOW + 300);
    const order = await stored(first.orderId);
    expect(order.read_token_hash).not.toBe(first.readToken);
    expect(JSON.stringify(order)).not.toContain(secretKey);
    expect(JSON.stringify(order)).not.toContain(first.readToken as string);
    const changed = await handleRequest(createRequest(secretKey, '102'), env, deps());
    expect(changed.status).toBe(409);
    const unavailableFeed = { now: () => NOW + 1000, fetcher: (async () => { throw new Error('offline'); }) as typeof fetch };
    const restarted = await handleRequest(createRequest(), { ...env }, unavailableFeed);
    expect(restarted.status).toBe(200); expect((await restarted.json() as Record<string, unknown>).orderId).toBe(first.orderId);
  });
  it('converges simultaneous creates onto one order', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => handleRequest(createRequest(), env, deps())));
    const orders = await Promise.all(results.map(result => result.json() as Promise<Record<string, unknown>>));
    expect(new Set(orders.map(order => order.orderId)).size).toBe(1);
    expect((await env.DB!.prepare('SELECT COUNT(*) AS count FROM payment_orders').first<{ count: number }>())?.count).toBe(1);
  });
  it('rejects stale market data without creating an order', async () => {
    const stale = { now: () => NOW, fetcher: (async () => response({ 'the-open-network': { usd: 2, last_updated_at: NOW - 301 } })) as typeof fetch };
    const result = await handleRequest(createRequest(), env, stale);
    expect(result.status).toBe(503); expect((await result.json() as Record<string, unknown>).code).toBe('STALE_QUOTE');
    expect((await env.DB!.prepare('SELECT COUNT(*) AS count FROM payment_orders').first<{ count: number }>())?.count).toBe(0);
  });
  it('uses a recent genuine USD trade when the primary price feed is unavailable', async () => {
    const fallback = { now: () => NOW, fetcher: (async (input: RequestInfo | URL) => String(input).startsWith('https://api.coingecko.com/')
      ? response({}, 403)
      : response({ error: [], result: { TONUSD: [['2.0000000', '1', NOW - 15 + 0.25, 'b', 'm', '', 1]], last: '1' } })) as typeof fetch };
    const result = await handleRequest(createRequest(), env, fallback);
    expect(result.status).toBe(201);
    const order = await result.json() as Record<string, unknown>;
    expect(order.quoteUsd).toBe('2.0000000'); expect(order.amountNanoTON).toBe('505000000');
    expect(order.status).toBe('pending');
  });
  it('never creates an invoice using a stale fallback trade', async () => {
    const fallback = { now: () => NOW, fetcher: (async (input: RequestInfo | URL) => String(input).startsWith('https://api.coingecko.com/')
      ? response({}, 403)
      : response({ error: [], result: { TONUSD: [['2', '1', NOW-301, 'b', 'm', '', 1]], last: '1' } })) as typeof fetch };
    expect((await handleRequest(createRequest(),env,fallback)).status).toBe(503);
    expect((await env.DB!.prepare('SELECT COUNT(*) AS count FROM payment_orders').first<{ count: number }>())?.count).toBe(0);
  });
  it('requires the private receipt token and ignores browser claims of success', async () => {
    const invoice = await create();
    const path = `https://release.example/api/payments/${invoice.orderId}?paid=true&status=success`;
    expect((await handleRequest(new Request(path), env, deps())).status).toBe(404);
    expect((await handleRequest(new Request(path, { headers: { Authorization: 'Bearer ' + 'x'.repeat(43) } }), env, deps())).status).toBe(404);
    const response = await handleRequest(new Request(path, { headers: { Authorization: 'Bearer ' + invoice.readToken } }), env, deps());
    const receipt = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200); expect(receipt.status).toBe('pending'); expect(receipt.readToken).toBeUndefined();
    expect(receipt.confirmation).toBeNull();
  });
});

describe('blockchain verification', () => {
  it('checks exact recipient, native amount, comment, execution and age', async () => {
    const invoice = await create(NOW - 100); const order = await stored(invoice.orderId);
    expect(matchingTransaction(transaction(order), order, NOW)).toBe('a'.repeat(64));
    for (const change of [{ success: false }, { aborted: true }, { account: { address: '0:' + '0'.repeat(64) } },
      { utime: NOW - 10 }, { utime: NOW - 101 }, { hash: 'invalid' }]) expect(matchingTransaction(transaction(order, change), order, NOW)).toBeNull();
    for (const change of [{ bounced: true }, { value: '505000001' }, { destination: { address: '0:' + '0'.repeat(64) } },
      { decoded_body: { text: 'wrong' } }, { msg_type: 'ext_in_msg' }, { op_code: '0x12345678' }]) {
      const tx = transaction(order); tx.in_msg = { ...(tx.in_msg as object), ...change };
      expect(matchingTransaction(tx, order, NOW)).toBeNull();
    }
  });
  it('recognizes an initial non-bounceable credit to an uninitialized wallet', async () => {
    const invoice = await create(NOW - 100); const order = await stored(invoice.orderId);
    const tx = transaction(order, { success: false, aborted: true, orig_status: 'nonexist', end_status: 'uninit',
      compute_phase: { skipped: true, skip_reason: 'cskip_no_state' }, credit_phase: { credit: order.amount_nano_ton, fees_collected: '0' },
      out_msgs: [], end_balance: order.amount_nano_ton });
    expect(matchingTransaction(tx, order, NOW)).toBe('a'.repeat(64));
    for (const change of [{ end_status: 'frozen' }, { destroyed: true }, { bounce_phase: 'TrPhaseBounceOk' },
      { credit_phase: { credit: '1' } }, { out_msgs: [{}] }, { compute_phase: { skipped: true, skip_reason: 'cskip_bad_state' } }]) {
      expect(matchingTransaction({ ...tx, ...change }, order, NOW)).toBeNull();
    }
    expect(matchingTransaction({ ...tx, in_msg: { ...(tx.in_msg as object), bounce: true } }, order, NOW)).toBeNull();
  });
  it('decodes a standard BOC text comment when the indexer has no decoded body', () => {
    const text = 'INW-' + '1'.repeat(32);
    const rawBody = Buffer.from(beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc()).toString('hex');
    expect(transactionComment({ raw_body: rawBody })).toBe(text);
    expect(transactionComment({ raw_body: rawBody, op_code: '0x1234' })).toBeNull();
  });
  it('records only verified transfers and prevents transaction hash reuse', async () => {
    const invoice = await create(NOW - 100); const order = await stored(invoice.orderId);
    const tx = transaction(order);
    await reconcilePayments(env, deps(NOW, [tx]));
    expect((await stored(invoice.orderId)).status).toBe('paid');
    const confirmed = (await stored(invoice.orderId)).confirmed_at;
    await reconcilePayments(env, deps(NOW + 11, [tx]));
    expect((await stored(invoice.orderId)).confirmed_at).toBe(confirmed);
    const next = await create(NOW - 100, '12345678-1234-4234-8234-123456789abc'); const nextOrder = await stored(next.orderId);
    await env.DB!.prepare('DELETE FROM payment_service_state WHERE key IN (?,?)').bind('ton_scan_lease', 'ton_scan_cursor').run();
    await reconcilePayments(env, deps(NOW + 20, [transaction(nextOrder)]));
    expect((await stored(next.orderId)).status).toBe('pending');
  });
  it('keeps a receipt pending when the indexer fails and records only operational status', async () => {
    const invoice = await create(NOW - 100);
    await reconcilePayments(env, { now:()=>NOW, fetcher:(async()=>response({error:'unavailable'},503)) as typeof fetch });
    expect((await stored(invoice.orderId)).status).toBe('pending');
    const health = await env.DB!.prepare("SELECT value FROM payment_service_state WHERE key='ton_scan_status'").first<{value:string}>();
    expect(JSON.parse(health!.value)).toEqual({checkedAt:NOW,outcome:'http_error',httpStatus:503});
    expect(await env.DB!.prepare("SELECT value FROM payment_service_state WHERE key='ton_scan_cursor'").first()).toBeNull();
    await reconcilePayments(env,deps(NOW+11));
    expect((await stored(invoice.orderId)).status).toBe('pending');
    const recovered = await env.DB!.prepare("SELECT value FROM payment_service_state WHERE key='ton_scan_status'").first<{value:string}>();
    expect(JSON.parse(recovered!.value).outcome).toBe('ok');
  });
  it('revisits transfers after the confirmation buffer and accepts a late credited invoice', async () => {
    const invoice = await create(NOW - 100); const order = await stored(invoice.orderId);
    const tx = transaction(order, { utime: NOW - 10 });
    await reconcilePayments(env, deps(NOW, [tx])); expect((await stored(invoice.orderId)).status).toBe('pending');
    await reconcilePayments(env, deps(NOW + 31, [tx])); expect((await stored(invoice.orderId)).status).toBe('paid');
    const late = await create(NOW - 1000, '12345678-1234-4234-8234-123456789abc'); const lateOrder = await stored(late.orderId);
    await env.DB!.prepare('DELETE FROM payment_service_state WHERE key IN (?,?)').bind('ton_scan_lease', 'ton_scan_cursor').run();
    await reconcilePayments(env, deps(NOW + 40, [transaction(lateOrder, { hash: 'b'.repeat(64) })]));
    expect((await stored(late.orderId)).status).toBe('paid');
  });
  it('resumes bounded pagination using exact logical times', async () => {
    const invoice = await create(NOW - 100); const order = await stored(invoice.orderId);
    const urls: URL[] = [];
    let calls = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); urls.push(url);
      const page = calls++;
      if (page === 3) return response({ transactions: [transaction(order, { lt: '9007199254749700' })] });
      return response({ transactions: Array.from({ length: 100 }, (_, index) => transaction(order, {
        lt: (9007199254750000n - BigInt(page * 100 + index)).toString(),
        in_msg: { msg_type: 'int_msg', decoded_op_name: 'text_comment', decoded_body: { text: 'unrelated' } },
      })) });
    }) as typeof fetch;
    await reconcilePayments(env, { now: () => NOW, fetcher });
    expect(calls).toBe(3); expect((await stored(invoice.orderId)).status).toBe('pending');
    await reconcilePayments(env, { now: () => NOW + 11, fetcher });
    expect(calls).toBe(4); expect(urls[3].searchParams.get('before_lt')).toBe('9007199254749701');
    expect((await stored(invoice.orderId)).status).toBe('paid');
  });
});

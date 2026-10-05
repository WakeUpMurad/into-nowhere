import { Address, Cell } from '@ton/core';
import { Buffer } from 'node:buffer';

export interface Env {
  DB?: D1Database;
  ASSETS?: Fetcher;
  PAYMENTS_ENABLED?: string;
  TON_RECIPIENT?: string;
  TON_RECIPIENT_RAW?: string;
  PAYMENT_MAX_AMOUNT_MINOR?: string;
  MERCHANT_NAME?: string;
  SUPPORT_EMAIL?: string;
  COINGECKO_API_KEY?: string;
  TONAPI_KEY?: string;
}

export interface PaymentOrder {
  id: string;
  idempotency_hash: string;
  request_hash: string;
  read_token_hash: string;
  amount_minor: string;
  currency: 'USD';
  intention: string;
  locale: string;
  recipient_address: string;
  recipient_raw: string;
  amount_nano_ton: string;
  charity_quarter_nano_ton: string;
  comment: string;
  quote_usd: string;
  quoted_at: number;
  created_at: number;
  expires_at: number;
  status: 'pending' | 'paid';
  transaction_hash: string | null;
  confirmed_at: number | null;
}

interface Dependencies {
  fetcher: typeof fetch;
  now: () => number;
}
const defaults: Dependencies = { fetcher: (...args) => fetch(...args), now: () => Math.floor(Date.now() / 1000) };
const QUOTE_MAX_AGE = 300;
const INVOICE_LIFETIME = 600;
const FINALITY_BUFFER = 30;
const MAX_SCAN_PAGES = 3;
const PAGE_SIZE = 100;
const MIN_AMOUNT = '100';
const priceURL = 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd&include_last_updated_at=true&precision=8';

class PaymentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validMinor(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,29}$/.test(value);
}

function maximum(env: Env): string | null {
  return validMinor(env.PAYMENT_MAX_AMOUNT_MINOR) && BigInt(env.PAYMENT_MAX_AMOUNT_MINOR) >= 100n ? env.PAYMENT_MAX_AMOUNT_MINOR : null;
}

export function recipientReady(env: Env): boolean {
  if (env.PAYMENTS_ENABLED !== 'true' || !env.DB || !env.TON_RECIPIENT || !env.TON_RECIPIENT_RAW || !env.MERCHANT_NAME || !env.SUPPORT_EMAIL) return false;
  try {
    const friendly = Address.parseFriendly(env.TON_RECIPIENT);
    return !friendly.isTestOnly && friendly.address.toRawString() === Address.parseRaw(env.TON_RECIPIENT_RAW).toRawString() && friendly.address.workChain === 0;
  } catch { return false; }
}

export function quoteNanoTon(amountMinor: string, quoteUsd: string): string {
  if (!validMinor(amountMinor) || !/^(0|[1-9][0-9]{0,10})(\.[0-9]{1,18})?$/.test(quoteUsd)) throw new PaymentError(503, 'QUOTE_UNAVAILABLE', 'A fresh TON price is unavailable.');
  const [integer, fraction = ''] = quoteUsd.split('.');
  const scaledPrice = BigInt(integer + fraction);
  if (scaledPrice <= 0n) throw new PaymentError(503, 'QUOTE_UNAVAILABLE', 'A fresh TON price is unavailable.');
  const numerator = BigInt(amountMinor) * 1_000_000_000n * 10n ** BigInt(fraction.length);
  const denominator = scaledPrice * 100n;
  return ((numerator + denominator - 1n) / denominator).toString();
}

// Quote prices and chain logical times arrive as JSON numbers. Preserve the
// exact numeric token rather than letting JSON.parse round a 64-bit integer.
export function parseExactJSON(text: string): unknown {
  // Validate the original grammar before replacing numeric tokens. Otherwise
  // a malformed number such as 01 could be accidentally accepted as a string.
  JSON.parse(text);
  const exact = text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => token.startsWith('"') ? token : JSON.stringify(token));
  return JSON.parse(exact);
}

function integer(value: unknown): string | null {
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function unix(value: unknown): number | null {
  const text = integer(value);
  if (text === null || BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(text);
}

async function readTextBounded(response: Response | Request, max: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > max) throw new PaymentError(413, 'REQUEST_TOO_LARGE', 'Request exceeds the supported size.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  let length = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > max) { await reader.cancel(); throw new PaymentError(413, 'REQUEST_TOO_LARGE', 'Request exceeds the supported size.'); }
      text += decoder.decode(next.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function receiptToken(key: string, orderId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`IntoNowhere/receipt/v1|${key}|${orderId}`)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function validKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(key) || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
}

function receipt(order: PaymentOrder, now: number, readToken?: string): Record<string, unknown> {
  return {
    orderId: order.id, ...(readToken ? { readToken } : {}), provider: 'ton', status: order.status,
    currency: order.currency, amountMinor: order.amount_minor, intention: order.intention,
    charityQuarterMinor: order.amount_minor, // USD-reference numerator; actual help liability is native TON below.
    amountNanoTON: order.amount_nano_ton, charityQuarterNanoTON: order.charity_quarter_nano_ton,
    recipientAddress: order.recipient_address, comment: order.comment, quoteUsd: order.quote_usd,
    quotedAt: new Date(order.quoted_at * 1000).toISOString(), expiresAt: new Date(order.expires_at * 1000).toISOString(),
    validUntil: Math.min(order.expires_at, now + 300),
    checkoutUrl: null, // TON Connect builds the exact transaction; this is not a hosted Epoint checkout.
    confirmation: order.status === 'paid' ? 'blockchain' : null,
    transactionHash: order.transaction_hash,
    confirmedAt: order.confirmed_at ? new Date(order.confirmed_at * 1000).toISOString() : null,
  };
}

interface Price { usd: string; updatedAt: number }
async function freshPrice(env: Env, deps: Dependencies): Promise<Price> {
  const cached = await env.DB!.prepare('SELECT value FROM payment_service_state WHERE key = ?').bind('ton_price').first<{ value: string }>();
  if (cached) {
    try {
      const price = JSON.parse(cached.value) as Price;
      if (typeof price.usd === 'string' && Number.isInteger(price.updatedAt) && deps.now() - price.updatedAt <= QUOTE_MAX_AGE && price.updatedAt <= deps.now() + 60) {
        quoteNanoTon('100', price.usd); return price;
      }
    } catch { /* Invalid or expired cached data cannot be used as a quote. */ }
  }
  const headers = new Headers({ accept: 'application/json' });
  if (env.COINGECKO_API_KEY) headers.set('x-cg-demo-api-key', env.COINGECKO_API_KEY);
  let price: Price | null = null;
  let primaryError: unknown;
  try {
    const response = await deps.fetcher(priceURL, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new PaymentError(503, 'QUOTE_UNAVAILABLE', 'A fresh TON price is unavailable.');
    const body = parseExactJSON(await readTextBounded(response, 16384));
    const item = isRecord(body) && body['the-open-network'];
    const updatedAt = isRecord(item) ? unix(item.last_updated_at) : null;
    const usd = isRecord(item) && typeof item.usd === 'string' ? item.usd : '';
    if (updatedAt === null || deps.now() - updatedAt > QUOTE_MAX_AGE || updatedAt > deps.now() + 60) throw new PaymentError(503, 'STALE_QUOTE', 'The TON price is too old. Please try again later.');
    quoteNanoTon('100', usd);
    price = { usd, updatedAt };
  } catch (error) { primaryError = error; }
  if (!price) {
    try {
      // A genuine USD trade is a fallback; never substitute USDT for USD.
      const response = await deps.fetcher('https://api.kraken.com/0/public/Trades?pair=TONUSD&count=1', { headers:{ accept:'application/json' }, signal:AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Market unavailable');
      const body = parseExactJSON(await readTextBounded(response, 16384));
      const result = isRecord(body) && body.result;
      const trades = isRecord(result) && result.TONUSD;
      if (!isRecord(body) || !Array.isArray(body.error) || body.error.length !== 0 || !Array.isArray(trades) || trades.length < 1) throw new Error('Invalid market data');
      const trade = trades[trades.length-1];
      if (!Array.isArray(trade) || typeof trade[0] !== 'string' || typeof trade[2] !== 'string' || !/^[0-9]+(?:\.[0-9]+)?$/.test(trade[2])) throw new Error('Invalid trade');
      const updatedAt = unix(trade[2].split('.')[0]);
      if (updatedAt === null || deps.now()-updatedAt > QUOTE_MAX_AGE || updatedAt > deps.now()+60) throw new Error('Stale market data');
      quoteNanoTon('100',trade[0]);
      price = { usd:trade[0], updatedAt };
    } catch {
      if (primaryError instanceof PaymentError) throw primaryError;
      throw new PaymentError(503,'QUOTE_UNAVAILABLE','A fresh TON price is unavailable. No invoice was created.');
    }
  }
  await env.DB!.prepare('INSERT INTO payment_service_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ton_price', JSON.stringify(price)).run();
  return price;
}

export async function createPayment(request: Request, env: Env, deps: Dependencies = defaults): Promise<Response> {
  if (!recipientReady(env)) throw new PaymentError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured. No money has been charged.');
  let body: unknown;
  try { body = JSON.parse(await readTextBounded(request, 4096)); }
  catch (error) { if (error instanceof PaymentError) throw error; throw new PaymentError(400, 'INVALID_REQUEST', 'Provide one payment JSON object.'); }
  if (!isRecord(body) || Object.keys(body).some(key => !['amountMinor', 'currency', 'intention', 'locale'].includes(key))) throw new PaymentError(400, 'INVALID_REQUEST', 'Unsupported payment request fields.');
  const limit = maximum(env);
  if (!validMinor(body.amountMinor) || BigInt(body.amountMinor) < BigInt(MIN_AMOUNT) || (limit !== null && BigInt(body.amountMinor) > BigInt(limit))) throw new PaymentError(400, 'INVALID_AMOUNT', 'Choose an amount within the supported limits.');
  if (body.currency !== 'USD') throw new PaymentError(400, 'INVALID_CURRENCY', 'The reference currency is USD. The actual transfer is TON.');
  if (typeof body.intention !== 'string' || !['wealth', 'health', 'success', 'love', 'gratitude'].includes(body.intention)) throw new PaymentError(400, 'INVALID_INTENTION', 'Choose an available intention.');
  const locale = body.locale ?? 'en';
  if (typeof locale !== 'string' || !['en', 'ru', 'az'].includes(locale)) throw new PaymentError(400, 'INVALID_LOCALE', 'Choose an available language.');
  const key = request.headers.get('Idempotency-Key') ?? '';
  if (!validKey(key)) throw new PaymentError(400, 'INVALID_IDEMPOTENCY_KEY', 'Provide a cryptographically random checkout key.');
  const keyHash = await digest(key);
  const requestHash = await digest(JSON.stringify([body.amountMinor, body.currency, body.intention, locale]));
  const existing = await env.DB!.prepare('SELECT * FROM payment_orders WHERE idempotency_hash=?').bind(keyHash).first<PaymentOrder>();
  if (existing) {
    if (existing.request_hash !== requestHash) throw new PaymentError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout key was already used for a different order.');
    return json(receipt(existing, deps.now(), await receiptToken(key, existing.id)));
  }
  const price = await freshPrice(env, deps);
  const now = deps.now();
  const id = crypto.randomUUID();
  const token = await receiptToken(key, id);
  const amountNanoTON = quoteNanoTon(body.amountMinor, price.usd);
  if (amountNanoTON.length > 30) throw new PaymentError(400, 'INVALID_AMOUNT', 'The amount exceeds the supported numeric format.');
  const comment = `INW-${id.replace(/-/g, '')}`;
  const raw = Address.parseRaw(env.TON_RECIPIENT_RAW!).toRawString();
  // OR IGNORE makes simultaneous retries converge on the winner's invoice.
  await env.DB!.prepare(`INSERT OR IGNORE INTO payment_orders
    (id,idempotency_hash,request_hash,read_token_hash,amount_minor,currency,intention,locale,recipient_address,recipient_raw,
     amount_nano_ton,charity_quarter_nano_ton,comment,quote_usd,quoted_at,created_at,expires_at,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`).bind(id,keyHash,requestHash,await digest(token),body.amountMinor,'USD',body.intention,locale,
      env.TON_RECIPIENT!,raw,amountNanoTON,amountNanoTON,comment,price.usd,price.updatedAt,now,now+INVOICE_LIFETIME).run();
  const stored = await env.DB!.prepare('SELECT * FROM payment_orders WHERE idempotency_hash=?').bind(keyHash).first<PaymentOrder>();
  if (!stored) throw new PaymentError(503, 'PAYMENT_STORAGE_UNAVAILABLE', 'Invoice could not be saved. No transfer was requested.');
  if (stored.request_hash !== requestHash) throw new PaymentError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout key was already used for a different order.');
  return json(receipt(stored, now, await receiptToken(key, stored.id)), stored.id === id ? 201 : 200);
}

function normalizedAddress(value: unknown): string | null {
  const text = typeof value === 'string' ? value : isRecord(value) && typeof value.address === 'string' ? value.address : null;
  if (!text) return null;
  try { return Address.parse(text).toRawString(); } catch { return null; }
}

export function transactionComment(message: Record<string, unknown>): string | null {
  const opcode = message.op_code;
  if (opcode !== undefined && opcode !== '0x00000000' && opcode !== '0x0' && opcode !== '0' && opcode !== 0) return null;
  if (message.decoded_op_name === 'text_comment' && isRecord(message.decoded_body) && typeof message.decoded_body.text === 'string') return message.decoded_body.text;
  if (typeof message.raw_body !== 'string' || !/^(?:[0-9a-fA-F]{2}){1,4096}$/.test(message.raw_body)) return null;
  try {
    const cells = Cell.fromBoc(Buffer.from(message.raw_body, 'hex'));
    if (cells.length !== 1) return null;
    const slice = cells[0].beginParse();
    return slice.loadUint(32) === 0 ? slice.loadStringTail() : null;
  } catch { return null; }
}

export function matchingTransaction(transaction: unknown, order: PaymentOrder, now: number): string | null {
  if (!isRecord(transaction) || !isRecord(transaction.in_msg)) return null;
  const incoming = transaction.in_msg;
  const time = unix(transaction.utime);
  if (time === null || time < order.created_at || now - time < FINALITY_BUFFER) return null;
  if (normalizedAddress(transaction.account) !== order.recipient_raw || normalizedAddress(incoming.destination) !== order.recipient_raw) return null;
  if (incoming.msg_type !== 'int_msg' || incoming.bounced !== false || integer(incoming.value) !== order.amount_nano_ton || transactionComment(incoming) !== order.comment) return null;
  const executed = transaction.success === true && transaction.aborted === false;
  // TON credits a non-bounceable message to an uninitialized wallet before
  // skipping compute because there is no code. That ordinary transaction is
  // marked aborted even though the funds remain on the receiving account.
  // Accept this narrow credited state, never an arbitrary failed transaction.
  const creditedUninitialized = transaction.transaction_type === 'TransOrd' &&
    transaction.success === false && transaction.aborted === true && transaction.destroyed === false &&
    (transaction.orig_status === 'nonexist' || transaction.orig_status === 'uninit') && transaction.end_status === 'uninit' &&
    incoming.bounce === false && isRecord(transaction.compute_phase) && transaction.compute_phase.skipped === true &&
    transaction.compute_phase.skip_reason === 'cskip_no_state' && isRecord(transaction.credit_phase) &&
    integer(transaction.credit_phase.credit) === order.amount_nano_ton &&
    !transaction.action_phase && !transaction.bounce_phase && Array.isArray(transaction.out_msgs) && transaction.out_msgs.length === 0 &&
    integer(transaction.end_balance) !== null && BigInt(integer(transaction.end_balance)!) > 0n;
  if (!executed && !creditedUninitialized) return null;
  return typeof transaction.hash === 'string' && /^[0-9a-f]{64}$/i.test(transaction.hash) ? transaction.hash.toLowerCase() : null;
}

interface ScanState { after: string; before: string | null; head: string | null }

// One persisted lease governs the entire receiving account, so polling several
// receipts does not multiply indexer traffic. Pagination resumes across calls.
export async function reconcilePayments(env: Env, deps: Dependencies = defaults): Promise<void> {
  if (!recipientReady(env)) return;
  const db = env.DB!;
  const pending = await db.prepare("SELECT MIN(created_at) AS oldest FROM payment_orders WHERE status='pending'").first<{ oldest: number | null }>();
  if (!pending?.oldest) return;
  const now = deps.now();
  const lease = await db.prepare(`INSERT INTO payment_service_state(key,value) VALUES('ton_scan_lease',?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(payment_service_state.value AS INTEGER) <= ?`).bind(String(now+40),now).run();
  if (lease.meta.changes !== 1) return;
  const saved = await db.prepare('SELECT value FROM payment_service_state WHERE key=?').bind('ton_scan_cursor').first<{ value: string }>();
  let state: ScanState = { after:'0', before:null, head:null };
  if (saved) {
    try {
      const parsed = JSON.parse(saved.value) as ScanState;
      if (integer(parsed.after) && (parsed.before === null || integer(parsed.before)) && (parsed.head === null || integer(parsed.head))) state = parsed;
    } catch { /* A corrupt cursor safely restarts the account scan. */ }
  }
  let complete = false;
  let progressed = false;
  let newestFinal = state.head;
  const scanStatus: { checkedAt:number; outcome:string; httpStatus?:number } = { checkedAt:now, outcome:'unavailable' };
  const recipient = Address.parseRaw(env.TON_RECIPIENT_RAW!).toRawString();
  try {
    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      const url = new URL(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(recipient)}/transactions`);
      url.searchParams.set('limit',String(PAGE_SIZE));
      url.searchParams.set('sort_order','desc');
      if (state.after !== '0') url.searchParams.set('after_lt',state.after);
      if (state.before) url.searchParams.set('before_lt',state.before);
      const headers = new Headers({ accept:'application/json' });
      if (env.TONAPI_KEY) headers.set('Authorization',`Bearer ${env.TONAPI_KEY}`);
      const response = await deps.fetcher(url.toString(),{ headers,signal:AbortSignal.timeout(8000) });
      scanStatus.httpStatus = response.status;
      if (response.status === 404) { scanStatus.outcome='empty'; complete = true; break; } // An unused account can have no indexed transactions.
      if (!response.ok) { scanStatus.outcome='http_error'; break; }
      const body = parseExactJSON(await readTextBounded(response,2<<20));
      if (!isRecord(body) || !Array.isArray(body.transactions)) { scanStatus.outcome='invalid_response'; break; }
      scanStatus.outcome='ok';
      const transactions = body.transactions;
      if (transactions.length === 0) { complete = true; break; }
      let lowest: string | null = null;
      let oldestTime = Number.MAX_SAFE_INTEGER;
      for (const transaction of transactions) {
        if (!isRecord(transaction)) continue;
        const lt = integer(transaction.lt);
        const time = unix(transaction.utime);
        if (lt === null || time === null) continue;
        if (lowest === null || BigInt(lt) < BigInt(lowest)) lowest = lt;
        oldestTime = Math.min(oldestTime,time);
        if (now-time >= FINALITY_BUFFER && (newestFinal === null || BigInt(lt) > BigInt(newestFinal))) newestFinal = lt;
        if (!isRecord(transaction.in_msg)) continue;
        const comment = transactionComment(transaction.in_msg);
        if (!comment || !/^INW-[0-9a-f]{32}$/.test(comment)) continue;
        const order = await db.prepare('SELECT * FROM payment_orders WHERE comment=? AND status=\'pending\'').bind(comment).first<PaymentOrder>();
        if (!order) continue;
        const hash = matchingTransaction(transaction,order,now);
        if (!hash) continue;
        // UNIQUE(transaction_hash) plus the pending predicate makes replays and
        // concurrent scanners incapable of creating a second paid receipt.
        await db.prepare(`UPDATE OR IGNORE payment_orders SET status='paid', transaction_hash=?, confirmed_at=?
          WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM payment_orders WHERE transaction_hash=?)`).bind(hash,now,order.id,hash).run();
      }
      if (lowest === null || (state.before !== null && BigInt(lowest) >= BigInt(state.before))) break;
      state.before = lowest;
      state.head = newestFinal;
      progressed = true;
      if (transactions.length < PAGE_SIZE || oldestTime < pending.oldest) { complete = true; break; }
    }
    if (complete) {
      // Advance only to the newest transaction old enough for confirmation.
      // Newer transfers are fetched again after the finality buffer elapses.
      state = { after:newestFinal ?? state.after, before:null, head:null };
    }
    if (progressed || complete) await db.prepare('INSERT INTO payment_service_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ton_scan_cursor',JSON.stringify(state)).run();
  } catch { /* Indexer failure keeps every unverified order pending. */ }
  finally {
    // Operational health only: no request headers, receipt secrets or provider bodies.
    await db.prepare('INSERT INTO payment_service_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ton_scan_status',JSON.stringify(scanStatus)).run();
    // Keep at least ten seconds between completed account scans.
    await db.prepare("UPDATE payment_service_state SET value=? WHERE key='ton_scan_lease' AND value=?").bind(String(now+10),String(now+40)).run();
  }
}

async function getReceipt(request: Request, env: Env, deps: Dependencies): Promise<Response> {
  if (!recipientReady(env)) throw new PaymentError(503,'PAYMENTS_NOT_CONFIGURED','Payments are not configured.');
  const id = new URL(request.url).pathname.slice('/api/payments/'.length);
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PaymentError(404,'PAYMENT_NOT_FOUND','Payment receipt not found.');
  const order = await env.DB!.prepare('SELECT * FROM payment_orders WHERE id=? AND read_token_hash=?').bind(id,await digest(token)).first<PaymentOrder>();
  if (!order) throw new PaymentError(404,'PAYMENT_NOT_FOUND','Payment receipt not found.');
  if (order.status === 'pending') {
    await reconcilePayments(env,deps);
    const updated = await env.DB!.prepare('SELECT * FROM payment_orders WHERE id=?').bind(id).first<PaymentOrder>();
    if (updated) return json(receipt(updated,deps.now()));
  }
  return json(receipt(order,deps.now()));
}

export async function handleRequest(request: Request, env: Env, deps: Dependencies = defaults): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/tonconnect-manifest.json') {
      const manifest = json({
        url:url.origin, name:env.MERCHANT_NAME || 'Into Nowhere', iconUrl:`${url.origin}/icon-512.png`,
        termsOfUseUrl:`${url.origin}/terms.html`, privacyPolicyUrl:`${url.origin}/privacy.html`,
      });
      manifest.headers.set('Access-Control-Allow-Origin', '*');
      return manifest;
    }
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({code:'NOT_FOUND',message:'Page not found.'},404);
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) throw new PaymentError(403,'ORIGIN_NOT_ALLOWED','This origin is not allowed.');
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'Allow':'GET, POST, OPTIONS'}});
    if (url.pathname === '/api/health' && request.method === 'GET') return json({status:'ok'});
    if (url.pathname === '/api/quote' && request.method === 'GET') {
      if (!recipientReady(env)) throw new PaymentError(503,'PAYMENTS_NOT_CONFIGURED','Payments are not configured.');
      const price = await freshPrice(env, deps);
      return json({quoteUsd:price.usd, updatedAt:new Date(price.updatedAt*1000).toISOString()});
    }
    if (url.pathname === '/api/config' && request.method === 'GET') {
      const live = recipientReady(env);
      return json({ mode:live?'live':'demo', currency:'USD', minAmountMinor:100,maxAmountMinor:live?maximum(env):null,
        paymentsEnabled:live,paymentMethods:live?['ton']:[],charitySharePercent:25,
        ...(live?{provider:'ton',merchantName:env.MERCHANT_NAME,supportEmail:env.SUPPORT_EMAIL,recipientAddress:env.TON_RECIPIENT}:{}),
      });
    }
    if (url.pathname === '/api/payments/create') {
      if (request.method !== 'POST') return new Response(JSON.stringify({code:'METHOD_NOT_ALLOWED',message:'Use POST.'}),{status:405,headers:{'Allow':'POST','content-type':'application/json','cache-control':'no-store'}});
      return await createPayment(request,env,deps);
    }
    if (url.pathname.startsWith('/api/payments/') && request.method === 'GET') return await getReceipt(request,env,deps);
    return json({code:'NOT_FOUND',message:'Endpoint not found.'},404);
  } catch (error) {
    if (error instanceof PaymentError) return json({code:error.code,message:error.message},error.status);
    return json({code:'PAYMENT_UNAVAILABLE',message:'Payment verification is temporarily unavailable. No payment has been confirmed.'},503);
  }
}

export default {
  fetch(request: Request,env: Env): Promise<Response> { return handleRequest(request,env); },
  scheduled(_controller: ScheduledController,env: Env,ctx: ExecutionContext): void { ctx.waitUntil(reconcilePayments(env)); },
};

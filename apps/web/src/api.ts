import { useQuery } from '@tanstack/react-query';
import type { Intention, Locale } from './i18n';

export type PaymentCurrency = 'USD' | 'AZN';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export interface PublicConfig {
  mode: 'demo' | 'live';
  currency: PaymentCurrency;
  minAmountMinor: number;
  maxAmountMinor: string | null;
  paymentsEnabled: boolean;
  paymentMethods: string[];
  charitySharePercent: 25;
  merchantName?: string;
  supportEmail?: string;
  provider?: 'epoint' | 'ton';
  recipientAddress?: string;
  manifestUrl?: string;
  supportUrl?: string;
}

export interface PaymentOrder {
  orderId: string;
  intention?: Intention;
  checkoutUrl: string | null;
  status: PaymentStatus;
  amountMinor: string;
  currency: PaymentCurrency;
  // Exact numerator with denominator 4, in currency minor units.
  charityQuarterMinor: string;
  confirmation: 'provider' | 'blockchain' | null;
  amountNanoTON?: string;
  charityQuarterNanoTON?: string;
  recipientAddress?: string;
  comment?: string;
  expiresAt?: string;
  validUntil?: number;
  quoteUsd?: string;
  quotedAt?: string;
  transactionHash?: string | null;
}
export interface TonPaymentOrder extends PaymentOrder {
  currency: 'USD';
  amountNanoTON: string;
  charityQuarterNanoTON: string;
  recipientAddress: string;
  comment: string;
  expiresAt: string;
  validUntil: number;
  quoteUsd: string;
  quotedAt?: string;
  transactionHash: string | null;
  confirmation: 'blockchain' | null;
}
export interface CreatedPaymentOrder extends PaymentOrder { readToken: string }
export interface PaymentReceipt { orderId: string; readToken: string }
export interface CreatePaymentInput {
  amountMinor: string;
  currency: PaymentCurrency;
  intention: Intention;
  locale: Locale;
}

const staticDemoConfig: PublicConfig = {
  mode: 'demo', currency: 'USD', minAmountMinor: 100, maxAmountMinor: null,
  paymentsEnabled: false, paymentMethods: [], charitySharePercent: 25,
};

const isPagesDemo = () => import.meta.env.VITE_DEPLOY_TARGET === 'github-pages';
export const TON_RECIPIENT_ADDRESS = 'UQDwlMjt0fw1LHrUdj8wV4tHOZ-Y5NQEAVgp49F7oJfQpJU6';
const canonicalMinor = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && value.length <= 30;
const currency = (value: unknown): value is PaymentCurrency => value === 'USD' || value === 'AZN';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// The public build setting is an API origin, never a secret or a payment key.
export function resolveApiBaseUrl(value: string | undefined): string {
  if (!value?.trim()) return '';
  const url = new URL(value.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API configuration requires an HTTPS origin');
  }
  return url.origin;
}

function apiUrl(path: string): string { return resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL) + path; }
export function paymentApiScope(): string { return resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL) || window.location.origin; }

export function validatePublicConfig(data: unknown): PublicConfig {
  if (!record(data) || !currency(data.currency) || !Number.isSafeInteger(data.minAmountMinor) || (data.minAmountMinor as number) < 1 || data.charitySharePercent !== 25 || !Array.isArray(data.paymentMethods) || !data.paymentMethods.every(method => typeof method === 'string')) {
    throw new Error('Invalid service configuration');
  }
  const max = data.maxAmountMinor ?? null;
  if (max !== null && (!canonicalMinor(max) || BigInt(max) < BigInt(data.minAmountMinor as number))) throw new Error('Invalid payment limits');
  if (data.mode === 'demo' && data.paymentsEnabled === false && data.paymentMethods.length === 0) {
    return { ...staticDemoConfig, currency: data.currency, minAmountMinor: data.minAmountMinor as number, maxAmountMinor: max as string | null };
  }
  const providerSupported = data.provider === 'epoint' && data.paymentMethods.length === 1 && data.paymentMethods[0] === 'card'
    || data.provider === 'ton' && data.paymentMethods.length === 1 && data.paymentMethods[0] === 'ton' && data.currency === 'USD' && data.recipientAddress === TON_RECIPIENT_ADDRESS;
  if (data.mode !== 'live' || data.paymentsEnabled !== true || !providerSupported || typeof data.merchantName !== 'string' || !data.merchantName.trim() || typeof data.supportEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.supportEmail)) {
    throw new Error('Unsupported service configuration');
  }
  const manifestUrl = typeof data.manifestUrl === 'string' ? data.manifestUrl : undefined;
  if (manifestUrl) {
    const manifest = new URL(manifestUrl);
    if (manifest.protocol !== 'https:' || manifest.username || manifest.password || manifest.hash || manifest.search) throw new Error('Invalid wallet manifest');
  }
  return {
    mode: 'live', currency: data.currency, minAmountMinor: data.minAmountMinor as number, maxAmountMinor: max as string | null,
    paymentsEnabled: true, paymentMethods: [...data.paymentMethods], charitySharePercent: 25,
    merchantName: data.merchantName, supportEmail: data.supportEmail, provider: data.provider as 'epoint' | 'ton',
    ...(data.provider === 'ton' ? { recipientAddress: TON_RECIPIENT_ADDRESS } : {}),
    ...(manifestUrl ? { manifestUrl } : {}),
  };
}

export function isPaymentReceipt(value: unknown): value is PaymentReceipt {
  return record(value) && typeof value.orderId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.orderId) && typeof value.readToken === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value.readToken);
}

export function validatePaymentOrder(data: unknown): PaymentOrder {
  if (!record(data) || typeof data.orderId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(data.orderId) || !['pending', 'paid', 'failed', 'refunded'].includes(data.status as string) || !canonicalMinor(data.amountMinor) || BigInt(data.amountMinor) < 1n || !currency(data.currency) || !canonicalMinor(data.charityQuarterMinor) || data.charityQuarterMinor !== data.amountMinor || (data.confirmation !== null && data.confirmation !== 'provider' && data.confirmation !== 'blockchain') || (data.status === 'paid' && data.confirmation === null) || (data.checkoutUrl !== null && typeof data.checkoutUrl !== 'string')) {
    throw new Error('Invalid payment confirmation');
  }
  const order: PaymentOrder = {
    orderId: data.orderId, checkoutUrl: data.checkoutUrl as string | null, status: data.status as PaymentStatus,
    amountMinor: data.amountMinor, currency: data.currency, charityQuarterMinor: data.charityQuarterMinor,
    confirmation: data.confirmation,
  };
  if (data.intention !== undefined) {
    if (!['wealth', 'health', 'success', 'love', 'gratitude'].includes(data.intention as string)) throw new Error('Invalid payment intention');
    order.intention = data.intention as Intention;
  }
  if ('amountNanoTON' in data) {
    if (data.currency !== 'USD' || !canonicalMinor(data.amountNanoTON) || BigInt(data.amountNanoTON) < 1n || data.charityQuarterNanoTON !== data.amountNanoTON || data.recipientAddress !== TON_RECIPIENT_ADDRESS || typeof data.comment !== 'string' || !/^INW-[A-Za-z0-9_-]{24,64}$/.test(data.comment) || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || !Number.isSafeInteger(data.validUntil) || (data.validUntil as number) < 1 || typeof data.quoteUsd !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(data.quoteUsd) || !/[1-9]/.test(data.quoteUsd) || (data.transactionHash !== null && (typeof data.transactionHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(data.transactionHash))) || (data.confirmation !== null && data.confirmation !== 'blockchain') || (data.status === 'paid' && (data.confirmation !== 'blockchain' || data.transactionHash === null))) throw new Error('Invalid TON payment confirmation');
    if (data.quotedAt !== undefined && (typeof data.quotedAt !== 'string' || !Number.isFinite(Date.parse(data.quotedAt)))) throw new Error('Invalid TON quote timestamp');
    return { ...order, amountNanoTON: data.amountNanoTON, charityQuarterNanoTON: data.charityQuarterNanoTON as string, recipientAddress: data.recipientAddress, comment: data.comment, expiresAt: data.expiresAt, validUntil: data.validUntil as number, quoteUsd: data.quoteUsd, transactionHash: data.transactionHash as string | null, ...(typeof data.quotedAt === 'string' ? { quotedAt: data.quotedAt } : {}) };
  }
  if (data.confirmation === 'blockchain') throw new Error('Missing TON confirmation details');
  return order;
}

export function isTonPaymentOrder(order: PaymentOrder): order is TonPaymentOrder { return typeof order.amountNanoTON === 'string' && order.recipientAddress === TON_RECIPIENT_ADDRESS && typeof order.comment === 'string'; }

// Epoint hosts the handoff. A URL returned by the API is still checked before navigation.
export function isTrustedCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname === 'epoint.az';
  } catch { return false; }
}

export async function createPayment(input: CreatePaymentInput, idempotencyKey: string, signal?: AbortSignal): Promise<CreatedPaymentOrder> {
  if (isPagesDemo()) throw new Error('Payments are disabled in the GitHub Pages demo');
  if (!canonicalMinor(input.amountMinor) || BigInt(input.amountMinor) < 1n || !currency(input.currency) || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error('Invalid payment request');
  const response = await fetch(apiUrl('/api/payments/create'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input), signal, credentials: 'omit', cache: 'no-store',
  });
  if (!response.ok) throw new Error('Payment could not be started');
  const data: unknown = await response.json();
  const order = validatePaymentOrder(data);
  if (!isPaymentReceipt(data) || order.amountMinor !== input.amountMinor || order.currency !== input.currency || (order.checkoutUrl !== null && !isTrustedCheckoutUrl(order.checkoutUrl))) throw new Error('Invalid checkout response');
  return { ...order, readToken: data.readToken };
}

export async function readPayment(receipt: PaymentReceipt, signal?: AbortSignal): Promise<PaymentOrder> {
  if (isPagesDemo()) throw new Error('Payments are disabled in the GitHub Pages demo');
  if (!isPaymentReceipt(receipt)) throw new Error('Invalid payment receipt');
  const response = await fetch(apiUrl(`/api/payments/${encodeURIComponent(receipt.orderId)}`), {
    headers: { Authorization: `Bearer ${receipt.readToken}` }, signal, credentials: 'omit', cache: 'no-store',
  });
  if (!response.ok) throw new Error('Payment confirmation is unavailable');
  const order = validatePaymentOrder(await response.json());
  if (order.orderId !== receipt.orderId) throw new Error('Payment receipt does not match');
  return order;
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: async ({ signal }): Promise<PublicConfig> => {
      // GitHub Pages stays a demo even if an API origin was accidentally supplied.
      if (isPagesDemo()) return staticDemoConfig;
      const response = await fetch(apiUrl('/api/config'), { signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error('Service configuration unavailable');
      return validatePublicConfig(await response.json());
    },
    staleTime: 60_000, retry: 1,
  });
}

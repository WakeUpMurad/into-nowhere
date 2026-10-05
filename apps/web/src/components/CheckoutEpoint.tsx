import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  createPayment, isPaymentReceipt, isTrustedCheckoutUrl, paymentApiScope, readPayment,
  type PaymentOrder, type PaymentReceipt, type PublicConfig,
} from '../api';
import { formatAmount } from '../domain/money';
import type { Intention, Locale } from '../i18n';

export interface CheckoutProps {
  config: PublicConfig;
  amountMinor: bigint | null;
  intention: Intention;
  locale: Locale;
  onConfirmed: (order: PaymentOrder) => void;
  onBusyChange?: (busy: boolean) => void;
  onOrderRestored?: (order: PaymentOrder) => void;
  onReset?: () => void;
}

const copy = {
  en: {
    pay: 'Pay {amount}', opening: 'Opening checkout…', secure: 'Secure checkout with Epoint',
    seller: 'Service provider', share: '25% of your payment before fees is set aside to help people directly.',
    pending: 'Waiting for payment confirmation…', paid: 'Payment confirmed. Thank you.', failed: 'Payment was not completed.', refunded: 'Your payment has been refunded.',
    uncertain: 'Confirmation is taking longer. Check this payment before starting another.',
    unavailable: 'Unable to check your payment right now. We will try again.',
    startError: 'Checkout could not be opened. Try again; the same payment request will be used.',
    check: 'Check payment', resume: 'Return to checkout', another: 'Make another gesture', contact: 'Contact support',
    invalid: 'Choose an amount within the available payment limits.',
  },
  ru: {
    pay: 'Оплатить {amount}', opening: 'Открываем оплату…', secure: 'Защищённая оплата через Epoint',
    seller: 'Исполнитель сервиса', share: '25% суммы оплаты до комиссии выделяется на прямую помощь людям.',
    pending: 'Ожидаем подтверждения оплаты…', paid: 'Оплата подтверждена. Спасибо.', failed: 'Оплата не завершена.', refunded: 'Оплата возвращена.',
    uncertain: 'Подтверждение задерживается. Проверь эту оплату, прежде чем начинать новую.',
    unavailable: 'Сейчас не удалось проверить оплату. Попробуем ещё раз.',
    startError: 'Не удалось открыть оплату. Попробуй снова — используем тот же запрос.',
    check: 'Проверить оплату', resume: 'Вернуться к оплате', another: 'Сделать ещё один жест', contact: 'Связаться с поддержкой',
    invalid: 'Выбери сумму в доступных пределах оплаты.',
  },
  az: {
    pay: '{amount} ödə', opening: 'Ödəniş açılır…', secure: 'Epoint ilə təhlükəsiz ödəniş',
    seller: 'Xidmət göstərən', share: 'Komissiyadan əvvəl ödənişin 25%-i insanlara birbaşa yardım üçün ayrılır.',
    pending: 'Ödəniş təsdiqi gözlənilir…', paid: 'Ödəniş təsdiqləndi. Təşəkkür edirik.', failed: 'Ödəniş tamamlanmadı.', refunded: 'Ödəniş geri qaytarılıb.',
    uncertain: 'Təsdiq gecikir. Yeni ödəniş etməzdən əvvəl bu ödənişi yoxla.',
    unavailable: 'Hazırda ödənişi yoxlamaq mümkün olmadı. Yenidən cəhd edəcəyik.',
    startError: 'Ödəniş açıla bilmədi. Yenidən cəhd et — eyni sorğudan istifadə ediləcək.',
    check: 'Ödənişi yoxla', resume: 'Ödənişə qayıt', another: 'Yeni jest et', contact: 'Dəstəklə əlaqə',
    invalid: 'Mövcud ödəniş limitləri daxilində məbləğ seç.',
  },
};

const receiptStorageKey = 'release-payment-receipt';
const attemptStorageKey = 'release-payment-attempt';
const pollingLimitMs = 3 * 60_000;

export function receiptFromFragment(fragment: string): PaymentReceipt | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  if (params.getAll('payment').length !== 1 || params.getAll('token').length !== 1) return null;
  const receipt = { orderId: params.get('payment'), readToken: params.get('token') };
  return isPaymentReceipt(receipt) ? receipt : null;
}

function clearReturnFragment(): void {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (!params.has('payment') && !params.has('token')) return;
  params.delete('payment'); params.delete('token');
  const remaining = params.toString();
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + (remaining ? `#${remaining}` : ''));
}

function storedReceipt(): PaymentReceipt | null {
  const fragment = receiptFromFragment(window.location.hash);
  if (fragment) return fragment;
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(receiptStorageKey) ?? 'null');
    if (raw && typeof raw === 'object' && 'scope' in raw && raw.scope === paymentApiScope() && 'expiresAt' in raw && typeof raw.expiresAt === 'number' && raw.expiresAt > Date.now() && isPaymentReceipt(raw)) return { orderId: raw.orderId, readToken: raw.readToken };
  } catch { /* The return fragment also works when browser storage is unavailable. */ }
  return null;
}

function saveReceipt(receipt: PaymentReceipt): void {
  try { sessionStorage.setItem(receiptStorageKey, JSON.stringify({ ...receipt, scope: paymentApiScope(), expiresAt: Date.now() + 24 * 60 * 60_000 })); } catch { /* Optional reload recovery. */ }
}

function retryKey(fingerprint: string): string {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(attemptStorageKey) ?? 'null');
    if (saved && typeof saved === 'object' && 'scope' in saved && saved.scope === paymentApiScope() && 'fingerprint' in saved && saved.fingerprint === fingerprint && 'key' in saved && typeof saved.key === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(saved.key)) return saved.key;
  } catch { /* In-memory retries remain possible. */ }
  const key = crypto.randomUUID();
  try { sessionStorage.setItem(attemptStorageKey, JSON.stringify({ scope: paymentApiScope(), fingerprint, key })); } catch { /* Optional reload recovery. */ }
  return key;
}

export function paymentPollDelay(elapsedMs: number): number { return elapsedMs < 30_000 ? 2_000 : elapsedMs < 90_000 ? 5_000 : 10_000; }

export function CheckoutEpoint({ config, amountMinor, intention, locale, onConfirmed, onBusyChange }: CheckoutProps) {
  const t = copy[locale];
  const live = config.mode === 'live' && config.paymentsEnabled && config.provider === 'epoint';
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(() => live ? storedReceipt() : null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [startError, setStartError] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const creationController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const confirmed = useRef<string | null>(null);
  const onConfirmedRef = useRef(onConfirmed);
  const onBusyChangeRef = useRef(onBusyChange);
  onConfirmedRef.current = onConfirmed;
  onBusyChangeRef.current = onBusyChange;
  const waiting = !!receipt && (!order || order.status === 'pending');
  const busy = creating || (waiting && !timedOut);
  const validAmount = amountMinor !== null && amountMinor >= BigInt(config.minAmountMinor) && (config.maxAmountMinor === null || amountMinor <= BigInt(config.maxAmountMinor));

  const acceptOrder = useCallback((next: PaymentOrder) => {
    setOrder(next);
    if (next.status === 'paid' && next.confirmation === 'provider' && confirmed.current !== next.orderId) {
      confirmed.current = next.orderId;
      onConfirmedRef.current(next);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    clearReturnFragment();
    return () => { mounted.current = false; creationController.current?.abort(); onBusyChangeRef.current?.(false); };
  }, []);
  useEffect(() => { onBusyChangeRef.current?.(live && busy); }, [live, busy]);
  useEffect(() => { if (receipt) saveReceipt(receipt); }, [receipt]);

  useEffect(() => {
    if (!live || !receipt) return;
    const currentReceipt = receipt;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const startedAt = Date.now();
    setTimedOut(false); setCheckError(false);
    async function check() {
      const elapsed = Date.now() - startedAt;
      if (stopped) return;
      if (elapsed >= pollingLimitMs) { setTimedOut(true); return; }
      if (!document.hidden) {
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 10_000);
        try {
          const next = await readPayment(currentReceipt, controller.signal);
          if (stopped) return;
          acceptOrder(next); setCheckError(false);
          if (next.status !== 'pending') return;
        } catch {
          if (stopped) return;
          setCheckError(true);
        } finally { clearTimeout(timeout); }
      }
      const remaining = pollingLimitMs - (Date.now() - startedAt);
      if (remaining <= 0) { setTimedOut(true); return; }
      timer = setTimeout(() => { void check(); }, Math.min(paymentPollDelay(Date.now() - startedAt), remaining));
    }
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); controller?.abort(); };
  }, [live, receipt, pollVersion, acceptOrder]);

  async function startPayment() {
    if (!live || !validAmount || amountMinor === null || creating || receipt) return;
    const input = { amountMinor: amountMinor.toString(), currency: config.currency, intention, locale };
    const fingerprint = JSON.stringify(input);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: retryKey(fingerprint) };
    const controller = new AbortController();
    creationController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setCreating(true); setStartError(false);
    try {
      const next = await createPayment(input, attempt.current.key, controller.signal);
      if (!mounted.current) return;
      const nextReceipt = { orderId: next.orderId, readToken: next.readToken };
      saveReceipt(nextReceipt); setReceipt(nextReceipt); acceptOrder(next);
      if (next.status === 'pending' && next.checkoutUrl) window.location.assign(next.checkoutUrl);
    } catch {
      if (mounted.current) setStartError(true);
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setCreating(false);
    }
  }

  function resetReceipt() {
    if (waiting) return;
    setReceipt(null); setOrder(null); setStartError(false); setCheckError(false); setTimedOut(false); attempt.current = null;
    try { sessionStorage.removeItem(receiptStorageKey); sessionStorage.removeItem(attemptStorageKey); } catch { /* Optional browser storage. */ }
  }

  if (!live) return null;
  const statusText = order?.status === 'paid' ? t.paid : order?.status === 'failed' ? t.failed : order?.status === 'refunded' ? t.refunded : timedOut ? t.uncertain : checkError ? t.unavailable : t.pending;
  return <div className="vn-checkout-panel">
    <div className="vn-checkout-note"><ShieldCheck aria-hidden="true" size={15}/><span>{t.secure}</span></div>
    <div className="vn-checkout-merchant">{t.seller}: {config.merchantName}</div>
    <div className="vn-checkout-note">{t.share}</div>
    {receipt ? <>
      <div className="vn-checkout-status" role="status" aria-live="polite">
        {order?.status === 'paid' ? <Check aria-hidden="true" size={18}/> : busy ? <LoaderCircle aria-hidden="true" size={18} className="vn-checkout-spinner"/> : null}
        <span>{statusText}</span>
      </div>
      {waiting && <div className="vn-checkout-controls">
        {timedOut && <button type="button" className="vn-checkout-secondary" onClick={() => { setTimedOut(false); setPollVersion(value => value + 1); }}>{t.check}</button>}
        {order?.checkoutUrl && isTrustedCheckoutUrl(order.checkoutUrl) && <a className="vn-checkout-secondary" href={order.checkoutUrl} rel="noreferrer">{t.resume}<ArrowUpRight aria-hidden="true" size={14}/></a>}
      </div>}
      {!waiting && <button type="button" className="vn-checkout-secondary" onClick={resetReceipt}>{t.another}</button>}
    </> : <>
      <button type="button" className="vn-action vn-checkout-action" disabled={!validAmount || creating} onClick={() => { void startPayment(); }}>
        {creating ? <LoaderCircle aria-hidden="true" size={18} className="vn-checkout-spinner"/> : <ShieldCheck aria-hidden="true" size={18}/>}
        <span>{creating ? t.opening : validAmount ? t.pay.replace('{amount}', formatAmount(amountMinor!, config.currency)) : t.invalid}</span>
      </button>
      {startError && <div className="vn-checkout-error" role="alert">{t.startError}</div>}
    </>}
    <a className="vn-checkout-support" href={`mailto:${config.supportEmail}`}>{t.contact}</a>
  </div>;
}

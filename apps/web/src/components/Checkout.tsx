import { useCallback, useEffect, useRef, useState } from 'react';
import { beginCell } from '@ton/core';
import { TonConnectUIProvider, THEME, UserRejectsError, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Check, ChevronDown, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import {
  createPayment, isPaymentReceipt, isTonPaymentOrder, paymentApiScope, readPayment, validatePaymentOrder,
  type PaymentOrder, type PaymentReceipt, type TonPaymentOrder,
} from '../api';
import { formatAmount } from '../domain/money';
import { CheckoutEpoint, type CheckoutProps } from './CheckoutEpoint';
import type { Locale } from '../i18n';

export { type CheckoutProps } from './CheckoutEpoint';

const copy = {
  en: {
    continue: 'Continue with TON', opening: 'Preparing payment…', connect: 'Connect TON wallet', pay: 'Pay {amount} TON',
    seller: 'Service provider', network: 'TON mainnet', fee: 'Your wallet shows the network fee separately.',
    share: '25% of the received TON, before network fees, is set aside to help people directly.',
    pending: 'Checking this payment…', ready: 'Invoice ready. Connect your wallet and confirm the payment there.', sent: 'Sent to your wallet. Waiting for confirmation on TON…', paid: 'Payment confirmed. Thank you.', failed: 'Payment was not completed.', refunded: 'Payment refunded.',
    uncertain: 'Confirmation is taking longer. Check this payment before sending again.', unavailable: 'Unable to check your payment right now. We will try again.',
    startError: 'Unable to prepare payment. Try again; we will use the same request.', rejected: 'You cancelled in your wallet. Nothing is confirmed yet.',
    walletError: 'The wallet did not confirm the result. Check this payment before sending again.', connectError: 'Unable to open the wallet list. Try again.',
    check: 'Check payment', another: 'Make another gesture', contact: 'Contact support', change: 'Change amount', newQuote: 'Get a new quote',
    expired: 'This quote has expired. If you sent TON, check the payment or contact support.', amount: 'Amount to send', reference: 'USD reference', recipient: 'Recipient and payment details',
    comment: 'Payment comment', copy: 'Copy', copied: 'Copied', wrongNetwork: 'Switch your wallet to TON mainnet to pay.',
    invalid: 'Choose an amount within the available payment limits.', disconnect: 'Disconnect wallet',
    orderId: 'Payment reference', transaction: 'Transaction hash', consentStart: 'By continuing, you accept the ', terms: 'Terms', consentAnd: ' and have read the ', privacy: 'Privacy Policy', consentEnd: '.',
  },
  ru: {
    continue: 'Продолжить с TON', opening: 'Готовим оплату…', connect: 'Подключить TON-кошелёк', pay: 'Оплатить {amount} TON',
    seller: 'Исполнитель сервиса', network: 'Основная сеть TON', fee: 'Комиссию сети кошелёк покажет отдельно.',
    share: '25% полученных TON до комиссий сети выделяется на прямую помощь людям.',
    pending: 'Проверяем эту оплату…', ready: 'Счёт готов. Подключи кошелёк и подтверди оплату в нём.', sent: 'Запрос отправлен в кошелёк. Ожидаем подтверждения в TON…', paid: 'Оплата подтверждена. Спасибо.', failed: 'Оплата не завершена.', refunded: 'Оплата возвращена.',
    uncertain: 'Подтверждение задерживается. Проверь эту оплату, прежде чем отправлять снова.', unavailable: 'Сейчас не удалось проверить оплату. Попробуем ещё раз.',
    startError: 'Не удалось подготовить оплату. Попробуй снова — используем тот же запрос.', rejected: 'Ты отменил запрос в кошельке. Оплата пока не подтверждена.',
    walletError: 'Кошелёк не подтвердил результат. Проверь оплату перед повторной отправкой.', connectError: 'Не удалось открыть список кошельков. Попробуй снова.',
    check: 'Проверить оплату', another: 'Сделать ещё один жест', contact: 'Связаться с поддержкой', change: 'Изменить сумму', newQuote: 'Получить новый расчёт',
    expired: 'Срок этого расчёта истёк. Если ты отправил TON, проверь оплату или свяжись с поддержкой.', amount: 'Сумма к отправке', reference: 'Ориентир в USD', recipient: 'Получатель и детали оплаты',
    comment: 'Комментарий платежа', copy: 'Копировать', copied: 'Скопировано', wrongNetwork: 'Переключи кошелёк на основную сеть TON для оплаты.',
    invalid: 'Выбери сумму в доступных пределах оплаты.', disconnect: 'Отключить кошелёк',
    orderId: 'Номер оплаты', transaction: 'Хеш транзакции', consentStart: 'Продолжая, ты принимаешь ', terms: 'условия сервиса', consentAnd: ' и подтверждаешь ознакомление с ', privacy: 'политикой конфиденциальности', consentEnd: '.',
  },
  az: {
    continue: 'TON ilə davam et', opening: 'Ödəniş hazırlanır…', connect: 'TON pulqabısını qoş', pay: '{amount} TON ödə',
    seller: 'Xidmət göstərən', network: 'TON əsas şəbəkəsi', fee: 'Şəbəkə komissiyası pulqabında ayrıca göstərilir.',
    share: 'Alınan TON-un şəbəkə komissiyalarından əvvəl 25%-i insanlara birbaşa yardım üçün ayrılır.',
    pending: 'Bu ödəniş yoxlanılır…', ready: 'Ödəniş hazırdır. Pulqabını qoş və ödənişi orada təsdiqlə.', sent: 'Sorğu pulqabına göndərildi. TON təsdiqi gözlənilir…', paid: 'Ödəniş təsdiqləndi. Təşəkkür edirik.', failed: 'Ödəniş tamamlanmadı.', refunded: 'Ödəniş geri qaytarıldı.',
    uncertain: 'Təsdiq gecikir. Yenidən göndərməzdən əvvəl bu ödənişi yoxla.', unavailable: 'Hazırda ödənişi yoxlamaq mümkün olmadı. Yenidən cəhd edəcəyik.',
    startError: 'Ödəniş hazırlana bilmədi. Yenidən cəhd et — eyni sorğudan istifadə ediləcək.', rejected: 'Pulqabında sorğunu ləğv etdin. Ödəniş hələ təsdiqlənməyib.',
    walletError: 'Pulqabı nəticəni təsdiqləmədi. Yenidən göndərməzdən əvvəl ödənişi yoxla.', connectError: 'Pulqabı siyahısı açıla bilmədi. Yenidən cəhd et.',
    check: 'Ödənişi yoxla', another: 'Yeni jest et', contact: 'Dəstəklə əlaqə', change: 'Məbləği dəyiş', newQuote: 'Yeni hesablamanı al',
    expired: 'Bu hesablamanın müddəti bitib. TON göndərmisənsə, ödənişi yoxla və ya dəstəyə müraciət et.', amount: 'Göndəriləcək məbləğ', reference: 'USD ekvivalenti', recipient: 'Alıcı və ödəniş detalları',
    comment: 'Ödəniş şərhi', copy: 'Kopyala', copied: 'Kopyalandı', wrongNetwork: 'Ödəniş üçün pulqabını TON əsas şəbəkəsinə keçir.',
    invalid: 'Mövcud ödəniş limitləri daxilində məbləğ seç.', disconnect: 'Pulqabını ayır',
    orderId: 'Ödəniş nömrəsi', transaction: 'Tranzaksiya heşi', consentStart: 'Davam etməklə ', terms: 'Xidmət şərtlərini', consentAnd: ' qəbul edir və ', privacy: 'Məxfilik siyasəti', consentEnd: ' ilə tanış olduğunu təsdiqləyirsən.',
  },
};

const receiptStorageKey = 'release-payment-receipt';
const attemptStorageKey = 'release-payment-attempt';
const sendStorageKey = 'release-ton-send-attempt';
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
  } catch { /* Wallet return still works when browser storage is unavailable. */ }
  return null;
}

function saveReceipt(receipt: PaymentReceipt): void {
  try { sessionStorage.setItem(receiptStorageKey, JSON.stringify({ ...receipt, scope: paymentApiScope(), expiresAt: Date.now() + 24 * 60 * 60_000 })); } catch { /* Optional reload recovery. */ }
}

export function newPaymentKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function retryKey(fingerprint: string): string {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(attemptStorageKey) ?? 'null');
    if (saved && typeof saved === 'object' && 'scope' in saved && saved.scope === paymentApiScope() && 'fingerprint' in saved && saved.fingerprint === fingerprint && 'key' in saved && typeof saved.key === 'string' && /^[A-Za-z0-9_-]{43}$/.test(saved.key)) return saved.key;
  } catch { /* In-memory retries remain possible. */ }
  const key = newPaymentKey();
  try { sessionStorage.setItem(attemptStorageKey, JSON.stringify({ scope: paymentApiScope(), fingerprint, key })); } catch { /* Optional reload recovery. */ }
  return key;
}

function sendAttempted(orderId: string): boolean {
  try { return sessionStorage.getItem(sendStorageKey) === orderId; } catch { return false; }
}
function saveSendAttempt(orderId: string | null): void {
  try { if (orderId) sessionStorage.setItem(sendStorageKey, orderId); else sessionStorage.removeItem(sendStorageKey); } catch { /* In-memory duplicate protection still applies. */ }
}

export function formatNanoTON(value: string): string {
  const nano = BigInt(value);
  const fraction = (nano % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${nano / 1_000_000_000n}${fraction ? `.${fraction}` : ''}`;
}

export function paymentPollDelay(elapsedMs: number): number { return elapsedMs < 30_000 ? 2_000 : elapsedMs < 90_000 ? 5_000 : 10_000; }

export function buildTonTransaction(order: TonPaymentOrder, nowMs = Date.now()) {
  if (!isTonPaymentOrder(validatePaymentOrder(order))) throw new Error('Invalid TON payment quote');
  const now = Math.floor(nowMs / 1000);
  const expiry = Math.floor(Date.parse(order.expiresAt) / 1000);
  const validUntil = Math.min(order.validUntil, now + 300, expiry);
  if (order.status !== 'pending' || validUntil <= now + 5) throw new Error('Payment quote is no longer valid');
  return {
    validUntil, network: '-239',
    messages: [{ address: order.recipientAddress, amount: order.amountNanoTON, payload: beginCell().storeUint(0, 32).storeStringTail(order.comment).endCell().toBoc().toString('base64') }],
  };
}

function TonCheckout({ config, amountMinor, intention, locale, onConfirmed, onBusyChange, onOrderRestored, onReset }: CheckoutProps) {
  const t = copy[locale];
  const [tonConnectUI, setTonOptions] = useTonConnectUI();
  const wallet = useTonWallet();
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(storedReceipt);
  const [order, setOrder] = useState<TonPaymentOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [startError, setStartError] = useState(false);
  const [walletError, setWalletError] = useState<'rejected' | 'unknown' | 'connect' | null>(null);
  const [checkError, setCheckError] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now);
  const [copied, setCopied] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const creationController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const confirmed = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const restored = useRef<string | null>(null);
  const onConfirmedRef = useRef(onConfirmed);
  const onBusyChangeRef = useRef(onBusyChange);
  const onOrderRestoredRef = useRef(onOrderRestored);
  const onResetRef = useRef(onReset);
  onConfirmedRef.current = onConfirmed;
  onBusyChangeRef.current = onBusyChange;
  onOrderRestoredRef.current = onOrderRestored;
  onResetRef.current = onReset;
  const waiting = !!receipt && (!order || order.status === 'pending');
  const validAmount = amountMinor !== null && amountMinor >= BigInt(config.minAmountMinor) && (config.maxAmountMinor === null || amountMinor <= BigInt(config.maxAmountMinor));
  const expired = !!order && Math.min(order.validUntil * 1000, Date.parse(order.expiresAt)) <= nowMs + 5000;
  const wrongNetwork = !!wallet && wallet.account.chain !== '-239';

  const acceptOrder = useCallback((next: PaymentOrder) => {
    if (!isTonPaymentOrder(next)) throw new Error('Unsupported payment confirmation');
    setOrder(next);
    if (restored.current !== next.orderId) { restored.current = next.orderId; onOrderRestoredRef.current?.(next); }
    if (next.status === 'paid' && next.confirmation === 'blockchain' && confirmed.current !== next.orderId) {
      confirmed.current = next.orderId;
      onConfirmedRef.current(next);
    }
  }, []);

  useEffect(() => {
    mounted.current = true; clearReturnFragment();
    return () => { mounted.current = false; creationController.current?.abort(); onBusyChangeRef.current?.(false); };
  }, []);
  useEffect(() => { setTonOptions({ language: locale === 'ru' ? 'ru' : 'en' }); }, [locale, setTonOptions]);
  useEffect(() => {
    const update = () => setTonOptions({ uiPreferences: { theme: document.documentElement.dataset.theme === 'light' ? THEME.LIGHT : THEME.DARK } });
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [setTonOptions]);
  useEffect(() => { onBusyChangeRef.current?.(creating || sending || waiting); }, [creating, sending, waiting]);
  useEffect(() => { if (receipt) { saveReceipt(receipt); setSubmitted(sendAttempted(receipt.orderId)); } }, [receipt]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    if (!receipt) return;
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
        } catch { if (!stopped) setCheckError(true); }
        finally { clearTimeout(timeout); }
      }
      const remaining = pollingLimitMs - (Date.now() - startedAt);
      if (remaining <= 0) { setTimedOut(true); return; }
      timer = setTimeout(() => { void check(); }, Math.min(paymentPollDelay(Date.now() - startedAt), remaining));
    }
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); controller?.abort(); };
  }, [receipt, pollVersion, acceptOrder]);

  async function preparePayment() {
    if (!validAmount || amountMinor === null || creationController.current || receipt) return;
    const input = { amountMinor: amountMinor.toString(), currency: config.currency, intention, locale };
    const fingerprint = JSON.stringify(input);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: retryKey(fingerprint) };
    const controller = new AbortController(); creationController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setCreating(true); setStartError(false);
    try {
      const next = await createPayment(input, attempt.current.key, controller.signal);
      if (!mounted.current) return;
      if (!isTonPaymentOrder(next)) throw new Error('Unsupported payment quote');
      const nextReceipt = { orderId: next.orderId, readToken: next.readToken };
      saveReceipt(nextReceipt); setReceipt(nextReceipt); acceptOrder(next); setNowMs(Date.now());
    } catch { if (mounted.current) setStartError(true); }
    finally { clearTimeout(timeout); creationController.current = null; if (mounted.current) setCreating(false); }
  }

  function sendPayment() {
    if (!order || !wallet || wrongNetwork || expired || submitted || sendingRef.current || order.status !== 'pending') return;
    let transaction;
    try { transaction = buildTonTransaction(order); } catch { setNowMs(Date.now()); return; }
    sendingRef.current = true; setSending(true); setSubmitted(true); setWalletError(null); saveSendAttempt(order.orderId);
    // This SDK call stays in the click handler so mobile wallets can open immediately.
    void tonConnectUI.sendTransaction(transaction, { skipRedirectToWallet: 'never', modals: ['before'], notifications: ['error'] }).then(() => {
      if (mounted.current) setPollVersion(value => value + 1);
      // A signed wallet message does not establish that the recipient was paid.
    }).catch((error: unknown) => {
      if (!mounted.current) return;
      if (error instanceof UserRejectsError) { setSubmitted(false); saveSendAttempt(null); setWalletError('rejected'); }
      else setWalletError('unknown');
    }).finally(() => { sendingRef.current = false; if (mounted.current) setSending(false); });
  }

  function resetReceipt() {
    if (sending || (waiting && submitted)) return;
    setReceipt(null); setOrder(null); setStartError(false); setWalletError(null); setCheckError(false); setTimedOut(false); setSubmitted(false); attempt.current = null;
    restored.current = null; onResetRef.current?.();
    try { sessionStorage.removeItem(receiptStorageKey); sessionStorage.removeItem(attemptStorageKey); saveSendAttempt(null); } catch { /* Optional browser storage. */ }
  }

  async function copyDetail(value: string, kind: string) {
    try { await navigator.clipboard.writeText(value); setCopied(kind); } catch { /* The full value remains selectable. */ }
  }

  const statusText = order?.status === 'paid' ? t.paid : order?.status === 'failed' ? t.failed : order?.status === 'refunded' ? t.refunded : expired ? t.expired : checkError ? t.unavailable : submitted ? timedOut ? t.uncertain : t.sent : order ? t.ready : t.pending;
  const consent = <p className="vn-checkout-consent">{t.consentStart}<a href={`${import.meta.env.BASE_URL}terms.html#${locale}`}>{t.terms}</a>{t.consentAnd}<a href={`${import.meta.env.BASE_URL}privacy.html#${locale}`}>{t.privacy}</a>{t.consentEnd}</p>;
  return <div className="vn-checkout-panel vn-ton-checkout">
    <div className="vn-checkout-note"><ShieldCheck aria-hidden="true" size={15}/><span>{t.network}</span></div>
    <div className="vn-checkout-merchant">{t.seller}: {config.merchantName}</div>
    {!receipt ? <>
      {consent}
      <button type="button" className="vn-action vn-checkout-action" disabled={!validAmount || creating} onClick={() => { void preparePayment(); }}>
        {creating ? <LoaderCircle aria-hidden="true" size={18} className="vn-checkout-spinner"/> : <Wallet aria-hidden="true" size={18}/>}
        <span>{creating ? t.opening : validAmount ? `${t.continue} · ${formatAmount(amountMinor!, config.currency)}` : t.invalid}</span>
      </button>
      {startError && <div className="vn-checkout-error" role="alert">{t.startError}</div>}
    </> : <>
      {order && <div className="vn-ton-quote">
        <span className="vn-small-label">{t.amount}</span><strong>{formatNanoTON(order.amountNanoTON)} TON</strong>
        <span className="vn-checkout-note">{t.reference}: {formatAmount(BigInt(order.amountMinor), order.currency)}</span>
        <span className="vn-checkout-note">{t.fee}</span>
        {consent}
      </div>}
      {waiting && order && !expired && !submitted && <>
        {wallet ? <>
          <button type="button" className="vn-action vn-checkout-action" disabled={sending || wrongNetwork} onClick={sendPayment}><Wallet aria-hidden="true" size={18}/><span>{t.pay.replace('{amount}', formatNanoTON(order.amountNanoTON))}</span></button>
          <button type="button" className="vn-checkout-secondary" disabled={sending} onClick={() => { void tonConnectUI.disconnect().catch(() => setWalletError('connect')); }}>{t.disconnect}</button>
          {wrongNetwork && <div className="vn-checkout-error" role="alert">{t.wrongNetwork}</div>}
        </> : <button type="button" className="vn-action vn-checkout-action" onClick={() => { setWalletError(null); void tonConnectUI.openModal().catch(() => setWalletError('connect')); }}><Wallet aria-hidden="true" size={18}/><span>{t.connect}</span></button>}
      </>}
      <div className="vn-checkout-status" role="status" aria-live="polite">
        {order?.status === 'paid' ? <Check aria-hidden="true" size={18}/> : waiting && !timedOut && (submitted || !order) ? <LoaderCircle aria-hidden="true" size={18} className="vn-checkout-spinner"/> : null}<span>{statusText}</span>
      </div>
      {walletError && <div className="vn-checkout-error" role="alert">{walletError === 'rejected' ? t.rejected : walletError === 'connect' ? t.connectError : t.walletError}</div>}
      <div className="vn-checkout-controls">
        {waiting && <button type="button" className="vn-checkout-secondary" disabled={sending} onClick={() => { setTimedOut(false); setPollVersion(value => value + 1); }}>{t.check}</button>}
        {(!waiting || (!submitted && !sending)) && <button type="button" className="vn-checkout-secondary" onClick={resetReceipt}>{waiting ? expired ? t.newQuote : t.change : t.another}</button>}
      </div>
      {order && <details className="vn-ton-details"><summary>{t.recipient}<ChevronDown aria-hidden="true" size={14}/></summary>
        <span className="vn-small-label">{t.orderId}</span><div className="vn-ton-address">{order.orderId}</div><button type="button" className="vn-checkout-secondary" onClick={() => { void copyDetail(order.orderId, 'order'); }}>{copied === 'order' ? t.copied : t.copy}</button>
        <div className="vn-ton-address">{order.recipientAddress}</div><button type="button" className="vn-checkout-secondary" onClick={() => { void copyDetail(order.recipientAddress, 'address'); }}>{copied === 'address' ? t.copied : t.copy}</button>
        <span className="vn-small-label">{t.comment}</span><div className="vn-ton-address">{order.comment}</div><button type="button" className="vn-checkout-secondary" onClick={() => { void copyDetail(order.comment, 'comment'); }}>{copied === 'comment' ? t.copied : t.copy}</button>
        {order.transactionHash && <><span className="vn-small-label">{t.transaction}</span><div className="vn-ton-address">{order.transactionHash}</div><button type="button" className="vn-checkout-secondary" onClick={() => { void copyDetail(order.transactionHash!, 'transaction'); }}>{copied === 'transaction' ? t.copied : t.copy}</button></>}
      </details>}
    </>}
    <div className="vn-checkout-note">{t.share}</div>
    <a className="vn-checkout-support" href={`mailto:${config.supportEmail}`}>{t.contact}</a>
  </div>;
}

export function Checkout(props: CheckoutProps) {
  if (props.config.mode !== 'live' || !props.config.paymentsEnabled) return null;
  if (props.config.provider === 'epoint') return <CheckoutEpoint {...props}/>;
  if (props.config.provider !== 'ton') return null;
  const manifestUrl = props.config.manifestUrl ?? new URL('tonconnect-manifest.json', `${window.location.origin}${import.meta.env.BASE_URL}`).href;
  return <TonConnectUIProvider manifestUrl={manifestUrl} language={props.locale === 'ru' ? 'ru' : 'en'} walletsRequiredFeatures={{ sendTransaction: { minMessages: 1 } }} analytics={{ mode: 'off' }}>
    <TonCheckout {...props}/>
  </TonConnectUIProvider>;
}

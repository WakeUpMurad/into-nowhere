import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Collapsible from '@radix-ui/react-collapsible';
import { AudioLines, Check, ChevronDown, Globe2, Monitor, Moon, Orbit, Sparkles, Sun } from 'lucide-react';
import { translations, type Intention, type Locale } from './i18n';
import { useRitualStore, type ThemePreference, type Wallet } from './store';
import { parseAmount, formatAmount } from './domain/money';
import { AmbientMusic } from './audio';
import { useReducedMotion, useTheme } from './hooks';
import { usePublicConfig } from './api';
const SacredGeometry = lazy(() => import('./components/SacredGeometry').then(module => ({ default: module.SacredGeometry })));

const intentions: Intention[] = ['wealth', 'health', 'success', 'love', 'gratitude'];
const languages: {value: Locale; name: string}[] = [{value:'ru',name:'Русский'},{value:'en',name:'English'},{value:'az',name:'Azərbaycanca'}];
const themes: ThemePreference[] = ['system', 'light', 'dark'];

export function App() {
  const state = useRitualStore();
  const t = translations[state.locale];
  const selected = t.topics[state.intention];
  const config = usePublicConfig();
  const reducedMotion = useReducedMotion();
  const resolvedTheme = useTheme(state.theme);
  const ThemeIcon = state.theme === 'system' ? Monitor : state.theme === 'dark' ? Moon : Sun;
  const amountMinor = parseAmount(state.amount);
  const validAmount = amountMinor !== null && amountMinor >= 100n;
  const [showValidation, setShowValidation] = useState(false);
  const [customAmountSelected, setCustomAmountSelected] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioPaused, setAudioPaused] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const ambient = useRef(new AmbientMusic());
  const audioMounted = useRef(true);
  const musicRequest = useRef(0);
  const musicPending = useRef(false);
  const ignoreClickUntil = useRef(0);
  const actionRef = useRef<HTMLButtonElement>(null);
  const busy = state.phase === 'holding' || state.phase === 'releasing';

  const playMusic = useCallback(async () => {
    const audio = ambient.current;
    if (document.hidden || !useRitualStore.getState().musicOn || audio.isPlaying || musicPending.current) return;
    const request = ++musicRequest.current;
    musicPending.current = true;
    setAudioError(false);
    try {
      const started = await audio.play();
      if (request !== musicRequest.current || !audioMounted.current || !useRitualStore.getState().musicOn || document.hidden) return;
      if (started) setAudioPaused(false);
    } catch {
      if (request !== musicRequest.current || !audioMounted.current || !useRitualStore.getState().musicOn) return;
      useRitualStore.getState().setMusic(false);
      audio.pause();
      setAudioPaused(false);
      setAudioError(true);
    } finally {
      if (request === musicRequest.current) musicPending.current = false;
    }
  }, []);

  useEffect(() => { document.documentElement.lang = state.locale; document.title = t.brand; }, [state.locale, t.brand]);
  useEffect(() => {
    if (state.phase !== 'releasing') return;
    const timer = setTimeout(() => useRitualStore.getState().setPhase('done'), reducedMotion ? 0 : 2800);
    return () => clearTimeout(timer);
  }, [state.phase, reducedMotion]);
  useEffect(() => {
    audioMounted.current = true;
    const gesture = (event: PointerEvent | KeyboardEvent | MouseEvent) => {
      if (!event.isTrusted || document.hidden) return;
      // The music button must be able to turn the default preference off silently.
      if (event.target instanceof Element && event.target.closest('.vn-music')) return;
      if (event instanceof KeyboardEvent) {
        if (event.repeat || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(event.key)) return;
      } else {
        if (event.button !== 0) return;
        // Mouse activation begins on down; touch and pen activation begins on up.
        if (event.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return;
        if (event.type === 'pointerup' && !['touch', 'pen'].includes((event as PointerEvent).pointerType)) return;
      }
      void playMusic();
    };
    const visibility = () => {
      if (!document.hidden) return;
      musicRequest.current++;
      musicPending.current = false;
      ambient.current.pause(); setAudioPaused(useRitualStore.getState().musicOn);
      if (useRitualStore.getState().phase === 'holding') useRitualStore.getState().setPhase('idle');
    };
    const audio = ambient.current;
    document.addEventListener('pointerdown', gesture, { capture: true, passive: true });
    document.addEventListener('pointerup', gesture, { capture: true, passive: true });
    document.addEventListener('click', gesture, { capture: true, passive: true });
    document.addEventListener('keydown', gesture, { capture: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      audioMounted.current = false;
      musicRequest.current++;
      musicPending.current = false;
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('pointerup', gesture, true);
      document.removeEventListener('click', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
      audio.close();
    };
  }, [playMusic]);
  function begin() {
    const current = useRitualStore.getState();
    if (current.phase === 'done') { current.setPhase('idle'); return false; }
    if (current.phase !== 'idle') return false;
    const amount = parseAmount(current.amount);
    if (amount === null || amount < 100n) { setShowValidation(true); return false; }
    setShowValidation(false); current.setPhase('holding');
    return true;
  }
  function release() {
    const current = useRitualStore.getState();
    if (current.phase !== 'holding') return;
    current.setPhase('releasing');
    if (current.musicOn) ambient.current.chime();
    if (!reducedMotion && !document.hidden) { try { navigator.vibrate?.([18,35,28]); } catch { /* Optional browser capability. */ } }
  }
  function cancelHold() { if (useRitualStore.getState().phase === 'holding') useRitualStore.getState().setPhase('idle'); }

  const caption = state.phase === 'idle' ? selected.caption : state.phase === 'holding' ? (state.intention === 'gratitude' ? t.holdingGratitude : t.holdingCaption) : state.phase === 'releasing' ? (state.intention === 'gratitude' ? t.releaseGratitude : t.releaseCaption) : state.intention === 'gratitude' ? t.completionGratitude : t.completionCaption;
  const actionLabel = state.phase === 'done' ? t.another : state.phase === 'holding' ? t.ready : state.phase === 'releasing' ? t.phases.releasing : validAmount ? t.demoAction.replace('{amount}',formatAmount(amountMinor!)) : t.amountPrompt;

  return <main id="vn-aurora" lang={state.locale}>
    <Collapsible.Root open={helpOpen} onOpenChange={setHelpOpen} asChild>
      <section className="vn-app" aria-label={t.appLabel} data-theme={resolvedTheme}>
        <header className="vn-header">
          <div className="vn-brand-group"><div className="vn-brand"><Orbit aria-hidden="true"/><span>{t.brand}</span></div><div className="vn-tagline">{t.tagline}</div></div>
          <div className="vn-header-actions">
            <Select.Root value={state.theme} onValueChange={value => state.setTheme(value as ThemePreference)}>
              <Select.Trigger className="vn-theme-trigger" aria-label={t.themeLabel} title={t.themes[state.theme]}><ThemeIcon aria-hidden="true"/><span className="vn-sr-only"><Select.Value/></span></Select.Trigger>
              <Select.Portal><Select.Content className="vn-theme-menu" position="popper" sideOffset={8}><Select.Viewport>{themes.map(theme => <Select.Item className="vn-theme-item" key={theme} value={theme}><Select.ItemText>{t.themes[theme]}</Select.ItemText><Select.ItemIndicator><Check size={14}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
            </Select.Root>
            <div className="vn-language"><Globe2 aria-hidden="true"/>
            <Select.Root value={state.locale} onValueChange={value => state.setLocale(value as Locale)}>
              <Select.Trigger className="vn-language-trigger" aria-label={t.languageLabel}><Select.Value/><Select.Icon><ChevronDown size={14}/></Select.Icon></Select.Trigger>
              <Select.Portal><Select.Content className="vn-language-menu" position="popper" sideOffset={8}><Select.Viewport>{languages.map(language => <Select.Item className="vn-language-item" key={language.value} value={language.value}><Select.ItemText>{language.name}</Select.ItemText><Select.ItemIndicator><Check size={14}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
            </Select.Root>
            </div>
          </div>
        </header>
        <div className="vn-topics" role="group" aria-label={t.topicsLabel}>{intentions.map(intention => <button type="button" className="vn-topic" key={intention} aria-pressed={state.intention===intention} disabled={busy} onClick={() => state.setIntention(intention)}>{t.topics[intention].name}</button>)}</div>
        <div className="vn-experience">
          <div className="vn-story">
            <div className="vn-eyebrow">{t.eyebrow}</div>
            <h1 className="vn-heading">{t.heading.map((heading,index) => <span key={index} className={index===2 ? 'vn-full-heading vn-heading-accent' : 'vn-full-heading'}>{heading}</span>)}<span className="vn-mobile-heading">{t.eyebrow}</span></h1>
            <div className="vn-description">{t.description}</div>
            {state.phase === 'done' ? <div className="vn-outcome" role="status">{selected.outcome}</div> : <div className="vn-intention"><span className="vn-small-label">{t.intentionLabel}</span><div className="vn-intention-text">{selected.intention}</div></div>}
            <div className="vn-amount-panel">
              <label htmlFor="vn-custom-amount" className="vn-small-label">{t.amountLabel}</label>
              <div className="vn-amount-controls">{['1','5','10'].map(amount => <button type="button" key={amount} className="vn-amount" aria-pressed={!customAmountSelected && amountMinor === BigInt(amount)*100n} disabled={busy} onClick={() => {setCustomAmountSelected(false);state.setAmount(amount);setShowValidation(false);}}>${amount}</button>)}<input id="vn-custom-amount" className="vn-custom" type="text" inputMode="decimal" placeholder={t.custom} aria-label={t.customAria} aria-invalid={showValidation&&!validAmount} aria-describedby={showValidation&&!validAmount ? 'vn-validation' : undefined} value={customAmountSelected?state.amount:''} disabled={busy} autoComplete="off" onChange={event => {setCustomAmountSelected(true);state.setAmount(event.target.value);setShowValidation(false);}}/></div>
              {showValidation&&!validAmount && <div id="vn-validation" className="vn-validation" role="alert">{t.validation}</div>}
              <div className="vn-amount-note">{t.amountNote}</div>
            </div>
            <div className="vn-payment-panel"><span className="vn-small-label">{t.paymentLabel}</span><div className="vn-payments" role="group" aria-label={t.paymentLabel}>{(['apple','google','card'] as Wallet[]).map(wallet => <button type="button" key={wallet} className="vn-wallet" aria-pressed={state.wallet===wallet} disabled={busy} onClick={() => state.setWallet(wallet)}>{wallet==='apple'?'Apple Pay':wallet==='google'?'Google Pay':t.card}</button>)}</div></div>
            <button ref={actionRef} type="button" className="vn-release" disabled={state.phase==='releasing'}
              onPointerDown={event => {if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();ignoreClickUntil.current=performance.now()+500;if(begin())event.currentTarget.setPointerCapture(event.pointerId);}}
              onPointerUp={event => {ignoreClickUntil.current=performance.now()+500;release();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
              onPointerCancel={cancelHold} onLostPointerCapture={cancelHold} onBlur={cancelHold}
              onClick={() => {if(performance.now()<ignoreClickUntil.current)return;if(begin())release();}}
              onKeyDown={event => {if((event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();begin();}}}
              onKeyUp={event => {if(event.key==='Enter'||event.key===' '){event.preventDefault();ignoreClickUntil.current=performance.now()+500;release();}}}
            ><span className="vn-button-label">{actionLabel}</span><Sparkles aria-hidden="true"/></button>
            <div className="vn-gesture-note">{state.phase==='done'?t.doneNote:t.holdNote}</div>
            <div className="vn-prototype-label">{t.demo}</div>
            {config.isError && <div className="vn-api-status" role="status">{t.queryUnavailable}</div>}
          </div>
          <div className="vn-art">
            <div className="vn-art-header"><span>{selected.name}</span><span className="vn-phase">{t.phases[state.phase]}</span></div>
            <Suspense fallback={<div className="vn-canvas-wrap" aria-hidden="true"><div className="vn-aura"/></div>}><SacredGeometry phase={state.phase} reducedMotion={reducedMotion} label={t.canvasAria}/></Suspense>
            <div className="vn-art-caption" aria-live="polite">{caption}</div>
            {state.phase==='done' && <div className="vn-memento"><div className="vn-small-label">{t.mementoLabel}</div><div className="vn-memento-title">{selected.name}</div><div className="vn-memento-copy">{selected.intention}</div></div>}
            <div className="vn-art-tools"><button type="button" className="vn-music" aria-pressed={state.musicOn} onClick={() => {if(useRitualStore.getState().musicOn){musicRequest.current++;musicPending.current=false;state.setMusic(false);ambient.current.pause();setAudioPaused(false);setAudioError(false);}else{state.setMusic(true);void playMusic();}}}><AudioLines aria-hidden="true"/><span>{state.musicOn?t.musicDisable:t.musicEnable}</span></button><span className="vn-symbolic">{t.symbolic}</span></div>
            <div className="vn-audio-status" role="status">{audioError?t.musicError:state.musicOn&&audioPaused?t.musicResume:''}</div>
          </div>
        </div>
        <footer className="vn-support"><div className="vn-support-number">25<span>%</span></div><div className="vn-support-copy"><span className="vn-small-label">{t.supportLabel}</span><div>{t.supportCopy}</div><span className="vn-mobile-support">{t.supportMobile}</span></div><Collapsible.Trigger className="vn-how"><span>{t.helpButton}</span><ChevronDown aria-hidden="true"/></Collapsible.Trigger></footer>
        <Collapsible.Content className="vn-help-panel"><div className="vn-small-label">{t.commercial}</div><div>{t.helpCopy}</div><div className="vn-help-note">{t.helpNote}</div></Collapsible.Content>
      </section>
    </Collapsible.Root>
  </main>;
}

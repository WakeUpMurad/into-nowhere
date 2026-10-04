import { useEffect, useLayoutEffect, useState } from 'react';
import type { ThemePreference } from './store';

export function useTheme(preference: ThemePreference): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const browserColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (browserColor) browserColor.content = getComputedStyle(document.body).backgroundColor;
  }, [resolved]);
  return resolved;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); media.addEventListener('change',update); return () => media.removeEventListener('change',update); }, []);
  return reduced;
}

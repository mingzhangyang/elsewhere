import React from 'react';
import ReactDOM from 'react-dom/client';
import RouteShell from './RouteShell';
import RecoveryBoundary from './components/RecoveryBoundary';
import './styles.css';
import { ensureTemporal } from './domain/temporal';
import { resolveLocale, setLanguage } from './i18n';
import { loadPreferences } from './lib/persistence';

// The saved choice, else the browser's language. Shared links never set it.
const locale = resolveLocale(loadPreferences().value.language);

async function start() {
  // Civil-time work needs Temporal; browsers without it fetch the polyfill first. The interface
  // language is its own small chunk, fetched alongside; an unavailable one falls back to English.
  await Promise.all([ensureTemporal(), setLanguage(locale).catch(() => setLanguage('en'))]);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RecoveryBoundary>
        <RouteShell
          diagnostics={import.meta.env.DEV && new URLSearchParams(location.search).has('diagnostics')}
        />
      </RecoveryBoundary>
    </React.StrictMode>,
  );
}

// Without a catalog there are no messages to show, so this one sentence is kept here in both languages.
const START_FAILED = {
  en: 'Elsewhere could not start. Check your connection and reload the page.',
  'zh-Hans': 'Elsewhere 无法启动。请检查网络连接后重新加载页面。',
};
start().catch(() => {
  document.getElementById('root')!.textContent = START_FAILED[locale];
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
      window.dispatchEvent(new CustomEvent('elsewhere-offline-unavailable'));
    });
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RecoveryBoundary from './components/RecoveryBoundary';
import './styles.css';
import { ensureTemporal } from './domain/temporal';
import { loadStarCatalog } from './domain/stars';

// Start fetching the star catalog now, but draw the first screen without waiting for it.
loadStarCatalog().catch(() => {});

async function start() {
  // Civil-time work needs Temporal; browsers without it fetch the polyfill first.
  await ensureTemporal();
  const scenario = import.meta.env.DEV
    ? (await import('./dev/scenarios')).scenarioProps(new URLSearchParams(location.search).get('scenario'))
    : {};
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RecoveryBoundary>
        <App
          {...scenario}
          diagnostics={import.meta.env.DEV && new URLSearchParams(location.search).has('diagnostics')}
        />
      </RecoveryBoundary>
    </React.StrictMode>,
  );
}

start().catch(() => {
  document.getElementById('root')!.textContent =
    'Elsewhere could not start. Check your connection and reload the page.';
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
      window.dispatchEvent(new CustomEvent('elsewhere-offline-unavailable'));
    });
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RecoveryBoundary from './components/RecoveryBoundary';
import './styles.css';

const scenario = import.meta.env.DEV
  ? (await import('./dev/scenarios')).scenarioProps(new URLSearchParams(location.search).get('scenario'))
  : {};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RecoveryBoundary><App {...scenario} diagnostics={import.meta.env.DEV && new URLSearchParams(location.search).has('diagnostics')} /></RecoveryBoundary>
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
      window.dispatchEvent(new CustomEvent('elsewhere-offline-unavailable'));
    });
  });
}

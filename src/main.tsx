import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const scenario = import.meta.env.DEV
  ? (await import('./dev/scenarios')).scenarioProps(new URLSearchParams(location.search).get('scenario'))
  : {};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App {...scenario} />
  </React.StrictMode>,
);

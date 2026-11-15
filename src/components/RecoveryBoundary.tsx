import { Component, type ReactNode } from 'react';
import { currentLanguage } from '../i18n';

export default class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { recovery } = currentLanguage().m;
    return (
      <main className="recovery-page">
        <h1>{recovery.title}</h1>
        <p>{recovery.body}</p>
        <button className="primary-button" onClick={() => window.location.reload()}>
          {recovery.reload}
        </button>
        <a href={import.meta.env.BASE_URL}>{recovery.fresh}</a>
      </main>
    );
  }
}

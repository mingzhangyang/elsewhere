import { Component, type ReactNode } from 'react';

export default class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-page">
        <h1>The sky needs a fresh start</h1>
        <p>
          Something interrupted this exploration. Reload to try again, or open a fresh view. Your saved places
          remain in this browser.
        </p>
        <button className="primary-button" onClick={() => window.location.reload()}>
          Reload app
        </button>
        <a href={import.meta.env.BASE_URL}>Open a fresh view</a>
      </main>
    );
  }
}

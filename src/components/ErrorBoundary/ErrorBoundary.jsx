import React from 'react';

/**
 * WHAT: Catches JavaScript errors in child components so the whole app does not go blank.
 * WHY: One broken screen should show a friendly message instead of a white page.
 * HOW: React error boundary — stores the error in state and renders a reload button.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 32, maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <h2 style={{ color: '#0f172a', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 16 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#00a2e8',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

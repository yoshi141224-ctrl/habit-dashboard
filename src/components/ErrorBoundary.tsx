import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; errorMessage: string; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log error for debugging
    console.error('[HabitDashboard] React error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#f0ece6',
          padding: '24px',
          gap: '20px',
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
          <div style={{ fontSize: '52px', lineHeight: 1 }}>😅</div>
          <div>
            <h2 style={{ fontSize: '18px', color: '#1e1b17', fontWeight: '700', marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '12px', color: '#9a938c', maxWidth: '260px', lineHeight: 1.5 }}>
              {this.state.errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#2d2926',
              color: '#fff',
              border: 'none',
              borderRadius: '24px',
              padding: '12px 32px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NotificationContext = createContext(null);

const toneStyles = {
  info: {
    accent: '#0B5D3B',
    surface: '#f4fbf7',
    border: '#b9ddc9',
  },
  warning: {
    accent: '#9a6a14',
    surface: '#fff8e7',
    border: '#ead49a',
  },
  danger: {
    accent: '#b42318',
    surface: '#fff4f2',
    border: '#f3b8b0',
  },
};

export function NotificationProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const finish = useCallback((result) => {
    dialog?.resolve?.(result);
    setDialog(null);
  }, [dialog]);

  const showMessage = useCallback((options = {}) => new Promise((resolve) => {
    setDialog({
      kind: 'message',
      title: options.title || 'Notice',
      message: options.message || '',
      primaryLabel: options.primaryLabel || 'OK',
      tone: options.tone || 'info',
      resolve,
    });
  }), []);

  const showError = useCallback((options = {}) => showMessage({
    title: options.title || 'Something went wrong',
    message: options.message || '',
    primaryLabel: options.primaryLabel || 'OK',
    tone: 'danger',
  }), [showMessage]);

  const requestConfirmation = useCallback((options = {}) => new Promise((resolve) => {
    setDialog({
      kind: 'decision',
      title: options.title || 'Continue?',
      message: options.message || '',
      primaryLabel: options.primaryLabel || 'Continue',
      secondaryLabel: options.secondaryLabel || 'Cancel',
      tone: options.tone || 'warning',
      resolve,
    });
  }), []);

  const value = useMemo(() => ({
    showMessage,
    showError,
    requestConfirmation,
  }), [requestConfirmation, showError, showMessage]);

  const styles = toneStyles[dialog?.tone] || toneStyles.info;

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(9, 21, 16, 0.52)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="nl-notification-title"
            style={{
              width: 'min(440px, 100%)',
              borderRadius: 10,
              border: `1px solid ${styles.border}`,
              background: '#ffffff',
              boxShadow: '0 24px 80px rgba(11, 45, 35, 0.28)',
              overflow: 'hidden',
              color: '#0B2D23',
              fontFamily: 'Inter, DM Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            <div
              style={{
                padding: '18px 22px',
                background: styles.surface,
                borderBottom: `1px solid ${styles.border}`,
              }}
            >
              <h2
                id="nl-notification-title"
                style={{
                  margin: 0,
                  color: styles.accent,
                  fontSize: 18,
                  lineHeight: 1.25,
                  fontWeight: 800,
                }}
              >
                {dialog.title}
              </h2>
            </div>
            {dialog.message && (
              <div
                style={{
                  padding: '20px 22px 4px',
                  color: '#2f493f',
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                }}
              >
                {dialog.message}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                padding: '20px 22px 22px',
              }}
            >
              {dialog.kind === 'decision' && (
                <button
                  type="button"
                  onClick={() => finish(false)}
                  style={{
                    minHeight: 40,
                    padding: '0 16px',
                    borderRadius: 8,
                    border: '1px solid #d8e2dc',
                    background: '#ffffff',
                    color: '#345247',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {dialog.secondaryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => finish(true)}
                autoFocus
                style={{
                  minHeight: 40,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: `1px solid ${styles.accent}`,
                  background: styles.accent,
                  color: '#ffffff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {dialog.primaryLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used inside NotificationProvider');
  }
  return context;
}

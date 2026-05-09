import { useEffect, useState } from 'react';
import { LeafLoader } from './LeafLoader';
import { DATA_LOADING_EVENT } from '../lib/dataLoading';

export default function GlobalDataLoader() {
  const [state, setState] = useState({ count: 0, label: 'Loading market data' });

  useEffect(() => {
    const onLoading = (event) => {
      const detail = event.detail || {};
      setState((current) => {
        const count = detail.active
          ? current.count + 1
          : Math.max(0, current.count - 1);
        return {
          count,
          label: detail.label || current.label || 'Loading market data',
        };
      });
    };

    window.addEventListener(DATA_LOADING_EVENT, onLoading);
    return () => window.removeEventListener(DATA_LOADING_EVENT, onLoading);
  }, []);

  if (state.count <= 0) return null;

  return (
    <div className="nl-global-data-loader" role="status" aria-live="polite">
      <div className="nl-global-data-loader-card">
        <LeafLoader label={state.label} compact />
      </div>
    </div>
  );
}

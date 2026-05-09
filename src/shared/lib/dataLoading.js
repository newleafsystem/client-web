export const DATA_LOADING_EVENT = 'newleaf:data-loading';

export function emitDataLoading(active, label = 'Loading market data') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DATA_LOADING_EVENT, {
    detail: { active: Boolean(active), label },
  }));
}

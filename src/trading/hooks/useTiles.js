import { useState, useEffect } from 'react';
import { fetchLatestRecommendationBatch, recommendationBatchToTiles } from '../../shared/api/recommendations';

/**
 * Loads published recommendation tiles from the NewLeaf API.
 * @returns {Object} { tiles, loading, error }
 */
export function useTiles({ enabled = true } = {}) {
  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setTiles([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    let cancelled = false;
    fetchLatestRecommendationBatch()
      .then((batch) => {
        if (cancelled) return;
        setTiles(recommendationBatchToTiles(batch));
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTiles([]);
        setError(err?.message || 'Unable to load opportunities.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { tiles, loading, error };
}

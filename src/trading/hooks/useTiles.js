import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';

/**
 * Real-time Firestore listener for active tiles
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
    try {
      // Query active tiles ordered by sortOrder
      const tilesRef = collection(db, 'tiles');
      const q = query(
        tilesRef,
        where('isActive', '==', true),
        orderBy('sortOrder', 'asc')
      );

      // Set up real-time listener
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const tilesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          setTiles(tilesData);
          setLoading(false);
          setError(null);
        },
        (err) => {
          setError(err?.message || 'Unable to load opportunities.');
          setLoading(false);
        }
      );

      // Cleanup listener on unmount
      return () => unsubscribe();

    } catch (err) {
      setError(err?.message || 'Unable to load opportunities.');
      setLoading(false);
    }
  }, [enabled]);

  return { tiles, loading, error };
}

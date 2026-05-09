import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../shared/hooks/useAuth';

export function usePortfolio() {
  const { user } = useAuth();
  const [portfolioItems, setPortfolioItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setPortfolioItems([]);
      setLoading(false);
      return;
    }

    try {
      const portfolioRef = collection(db, 'users', user.uid, 'portfolio');
      const q = query(portfolioRef);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          console.log('Portfolio snapshot received:', {
            docCount: snapshot.docs.length,
            docs: snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
          });

          const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setPortfolioItems(items);
          setLoading(false);
          setError(null);

          console.log('Portfolio items updated:', items.length, 'items');
        },
        (err) => {
          console.error('Error fetching portfolio:', err);
          setError(err.message);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up portfolio listener:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [user]);

  const addToPortfolio = async (tile) => {
    if (!user) return;

    try {
      // Ensure tile.id exists, otherwise log error
      if (!tile.id) {
        console.error('Cannot add to portfolio: tile.id is undefined', tile);
        throw new Error('Tile ID is required');
      }

      console.log('Adding to portfolio:', { tileId: tile.id, symbol: tile.symbol });

      // Store legs with entry premiums for leg-level P&L tracking
      const tileLegs = tile.legs || [];
      let netCredit = 0;
      const portfolioLegs = tileLegs.map((leg, i) => {
        const premium = leg.premium || 0;
        if (leg.action === 'sell') netCredit += premium;
        else netCredit -= premium;
        return {
          legIndex: i,
          type: leg.type,         // 'call', 'put', 'stock'
          action: leg.action,     // 'buy', 'sell'
          strike: leg.strike || 0,
          expiry: leg.expiry || tile.expiry || null,
          entryPremium: premium,  // price per share at entry
          entryIv: leg.iv || null, // IV at entry for Black-Scholes estimation
          currentPremium: 0,      // updated via admin or IB feed
        };
      });

      // Capture entry IV rank if available (for verdict engine vol-regime override)
      let entryIvRank = null;
      try {
        const analysisSnap = await getDoc(doc(db, 'analyses', tile.id));
        if (analysisSnap.exists()) {
          entryIvRank = analysisSnap.data()?.technicalIndicators?.impliedVolatility?.ivRank ?? null;
        }
      } catch (e) {
        // Non-critical — verdict engine will skip vol-regime override if null
      }

      const portfolioDocRef = doc(db, 'users', user.uid, 'portfolio', tile.id);
      await setDoc(portfolioDocRef, {
        tileId: tile.id,
        symbol: tile.symbol,
        strategy: tile.strategy,
        addedAt: serverTimestamp(),
        // Leg-level data (source of truth for P&L)
        legs: portfolioLegs,
        // Strategy-level entry pricing (calculated from legs)
        entryNetCredit: parseFloat((netCredit * 100).toFixed(2)),
        entryDate: new Date().toISOString().split('T')[0],
        // Strategy-level current pricing (auto-calculated from leg currentPremiums)
        currentNetValue: 0,
        lastPriceUpdate: null,
        // Position details
        expiry: tile.expiry || null,
        entryUnderlyingPrice: tile.underlyingPrice || 0,
        currentUnderlyingPrice: tile.underlyingPrice || 0,
        // Entry IV rank for verdict engine vol-regime-shift override (§9)
        entryIvRank,
        // Auto-calculated P&L (from legs)
        realizedPnl: 0,
        unrealizedPnl: 0,
        // Status
        status: 'active',
        quantity: 1
      });

      console.log('Successfully added to portfolio:', tile.id);
    } catch (err) {
      console.error('Error adding to portfolio:', err);
      throw err;
    }
  };

  const removeFromPortfolio = async (tileId) => {
    if (!user) return;

    try {
      console.log('Removing from portfolio:', tileId);
      const portfolioDocRef = doc(db, 'users', user.uid, 'portfolio', tileId);
      await deleteDoc(portfolioDocRef);
      console.log('Successfully removed from portfolio:', tileId);
    } catch (err) {
      console.error('Error removing from portfolio:', err);
      throw err;
    }
  };

  const isInPortfolio = (tileId) => {
    return portfolioItems.some(item => item.tileId === tileId);
  };

  const updateStatus = async (tileId, newStatus) => {
    if (!user) return;

    try {
      const portfolioDocRef = doc(db, 'users', user.uid, 'portfolio', tileId);
      await updateDoc(portfolioDocRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error updating portfolio status:', err);
      throw err;
    }
  };

  const updateQuantity = async (tileId, newQuantity) => {
    if (!user) return;

    try {
      const portfolioDocRef = doc(db, 'users', user.uid, 'portfolio', tileId);
      await updateDoc(portfolioDocRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error updating portfolio quantity:', err);
      throw err;
    }
  };

  const updatePortfolioItem = async (tileId, fields) => {
    if (!user) return;
    try {
      const portfolioDocRef = doc(db, 'users', user.uid, 'portfolio', tileId);
      await updateDoc(portfolioDocRef, { ...fields, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error('Error updating portfolio item:', err);
      throw err;
    }
  };

  return {
    portfolioItems,
    loading,
    error,
    addToPortfolio,
    removeFromPortfolio,
    updateStatus,
    updateQuantity,
    updatePortfolioItem,
    isInPortfolio
  };
}

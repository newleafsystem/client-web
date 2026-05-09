/**
 * usePositionLiveData — single data source for PositionDetail page.
 * Fetches R2 data, calculates live P&L, Greeks, risk scenarios, and status.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchR2Report } from '../api/r2Api';
import { calculatePositionPnl, getStrategyStatus, recalculateGreeks, pnlAtPrice } from '../utils/pnlCalculator';

export function usePositionLiveData(tile, portfolioItem) {
  const [r2Data, setR2Data] = useState(null);
  const [loading, setLoading] = useState(true);

  const symbol = tile?.symbol;
  const expiry = portfolioItem?.expiry || tile?.expiry;
  const quantity = portfolioItem?.quantity || 1;
  const maxProfit = tile?.maxProfit || 0;
  const maxLoss = tile?.maxLoss || 0;
  const legs = portfolioItem?.legs || tile?.legs || [];

  // Fetch R2 data
  const fetchData = useCallback(async () => {
    if (!symbol) return;
    try {
      const report = await fetchR2Report(symbol);
      setR2Data(report);
    } catch (err) {
      console.warn('[usePositionLiveData] R2 fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Current spot price
  const currentSpot = useMemo(() =>
    r2Data?.snapshot?.price || r2Data?.price || tile?.underlyingPrice || 0,
    [r2Data, tile]
  );

  // Entry price
  const entrySpot = portfolioItem?.entryUnderlyingPrice || tile?.publishedSpotPrice || tile?.underlyingPrice || 0;

  // R2 option chain
  const r2Chain = r2Data?.optionChain || null;

  // Live P&L
  const pnlResult = useMemo(() => {
    if (!portfolioItem || !currentSpot) return { unrealizedPnl: 0, currentNetValue: 0, entryNetCredit: 0, method: 'none', legDetails: [] };
    return calculatePositionPnl({ ...portfolioItem, tile }, currentSpot, r2Chain);
  }, [portfolioItem, tile, currentSpot, r2Chain]);

  // Strategy status
  const strategyStatus = useMemo(() => {
    if (!portfolioItem || !currentSpot) return { status: 'Unknown', statusColor: '#6b6b60', suggestion: '', urgency: 'none', details: {} };
    return getStrategyStatus({ ...portfolioItem, tile }, currentSpot, pnlResult);
  }, [portfolioItem, tile, currentSpot, pnlResult]);

  // Live Greeks
  const liveGreeks = useMemo(() => {
    if (!currentSpot || legs.length === 0) return { net: { delta: 0, gamma: 0, theta: 0, vega: 0 }, perLeg: [] };
    return recalculateGreeks(legs, currentSpot, expiry);
  }, [legs, currentSpot, expiry]);

  // Per-contract and total P&L
  const pnlPerContract = pnlResult.unrealizedPnl;
  const pnlTotal = pnlPerContract * quantity;

  // Progress: map P&L onto -maxLoss ↔ +maxProfit scale (0% = max loss, 100% = max profit)
  const progressPct = useMemo(() => {
    if (!maxLoss && !maxProfit) return 50;
    const range = maxLoss + maxProfit;
    if (range === 0) return 50;
    return Math.max(0, Math.min(100, ((pnlPerContract + maxLoss) / range) * 100));
  }, [pnlPerContract, maxLoss, maxProfit]);

  // Profit capture percentage
  const profitCapturePct = useMemo(() => {
    if (pnlPerContract >= 0 && maxProfit > 0) return Math.round((pnlPerContract / maxProfit) * 100);
    if (pnlPerContract < 0 && maxLoss > 0) return -Math.round((Math.abs(pnlPerContract) / maxLoss) * 100);
    return 0;
  }, [pnlPerContract, maxProfit, maxLoss]);

  // Risk scenarios at current spot
  const riskScenarios = useMemo(() => {
    if (!currentSpot || legs.length === 0) return [];
    return [
      { label: 'Bullish +10%', pct: '+10%', price: currentSpot * 1.1, pnl: pnlAtPrice(legs, currentSpot * 1.1), desc: `If ${symbol} rises 10%` },
      { label: 'No Move', pct: '0%', price: currentSpot, pnl: pnlAtPrice(legs, currentSpot), desc: `If ${symbol} stays flat` },
      { label: 'Bearish -10%', pct: '-10%', price: currentSpot * 0.9, pnl: pnlAtPrice(legs, currentSpot * 0.9), desc: `If ${symbol} falls 10%` },
    ];
  }, [currentSpot, legs, symbol]);

  // DTE
  const dte = useMemo(() => {
    if (!expiry) return null;
    return Math.max(0, Math.round((new Date(expiry + 'T16:00:00') - new Date()) / 86400000));
  }, [expiry]);

  // Price move since entry
  const priceMove = currentSpot && entrySpot ? ((currentSpot - entrySpot) / entrySpot * 100) : 0;

  return {
    loading,
    currentSpot,
    entrySpot,
    priceMove,
    dte,
    quantity,
    maxProfit,
    maxLoss,
    pnlResult,
    pnlPerContract,
    pnlTotal,
    progressPct,
    profitCapturePct,
    strategyStatus,
    liveGreeks,
    riskScenarios,
    legDetails: pnlResult.legDetails,
    r2Chain,
    refetch: fetchData,
  };
}

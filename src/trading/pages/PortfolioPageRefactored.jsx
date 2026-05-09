import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Edit2 } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePortfolioSettings } from '../hooks/usePortfolioSettings';
import { OnboardingModal } from '../components/OnboardingModal';
import { formatStrategy } from '../utils/formatters';
import { calculateMetrics, getUnderlyingPrice } from '../utils/optionsCalc';
import { getThemeClass, getChartColor } from '../utils/strategyThemes';
import { KpiCard, SegmentedTabs, Button } from '../components/ui';
import { fetchR2Report, matchOptionLeg } from '../api/r2Api';
import '../styles/newleaf-system.css';

export function PortfolioPageRefactored({ tiles }) {
  const navigate = useNavigate();
  const { portfolioItems, loading, updateStatus, removeFromPortfolio, updateQuantity, updatePortfolioItem } = usePortfolio();
  const { settings, updateSettings, loading: settingsLoading, needsOnboarding } = usePortfolioSettings();

  const [buildManageMode, setBuildManageMode] = useState('build');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewTab, setViewTab] = useState('positions'); // For Manage mode: positions, allocation, or risk
  const [editingCapital, setEditingCapital] = useState(false);
  const [capitalInput, setCapitalInput] = useState('');
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [posFilter, setPosFilter] = useState('all'); // 'all' | 'profitable' | 'at-risk'
  const [showLegs, setShowLegs] = useState(false);
  const [expandedPos, setExpandedPos] = useState(new Set());
  const [confirmClose, setConfirmClose] = useState(null);
  const [closingId, setClosingId] = useState(null);
  const [autoAllocate, setAutoAllocate] = useState(false);
  const [customAllocations, setCustomAllocations] = useState({}); // { tileId: allocationAmount }
  const [editingTotalCapital, setEditingTotalCapital] = useState(false);
  const [editingRiskPct, setEditingRiskPct] = useState(false);
  const [tempCapital, setTempCapital] = useState('');
  const [tempRiskPct, setTempRiskPct] = useState('');

  const safeSettings = settings || { totalCapital: 0, riskTolerance: 'moderate', maxAllocation: 0.30 };

  // R2-based price data for portfolio leg pricing
  // Shape: { [symbol]: { spot, legs: { "strike-expiry-type": mid } } }
  const [r2Prices, setR2Prices] = useState({});

  useEffect(() => {
    if (!settingsLoading && needsOnboarding && !onboardingDone) {
      const timer = setTimeout(() => setShowOnboarding(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowOnboarding(false);
    }
  }, [settingsLoading, needsOnboarding, onboardingDone]);

  // Keep a ref to portfolioItems so the syncPrices effect doesn't need it as a dep
  // (avoids infinite loop: update → portfolioItems changes → effect fires → update → ...)
  const portfolioItemsRef = useRef(portfolioItems);
  useEffect(() => {
    portfolioItemsRef.current = portfolioItems;
  }, [portfolioItems]);

  // Fetch R2 option chain data for portfolio leg pricing
  useEffect(() => {
    const symbols = [...new Set(
      (portfolioItemsRef.current || []).map(p => p.symbol).filter(Boolean)
    )];
    if (symbols.length === 0) return;

    const fetchR2 = async () => {
      const prices = {};
      await Promise.allSettled(symbols.map(async (sym) => {
        try {
          const r2 = await fetchR2Report(sym);
          const legPrices = {};
          for (const c of (r2.optionChain || [])) {
            const key = `${c.strike}-${c.expiry}-${c.type}`;
            legPrices[key] = c.mid;
          }
          prices[sym.toUpperCase()] = { spot: r2.snapshot?.price || 0, legs: legPrices };
        } catch (e) {
          console.warn(`[Portfolio] R2 fetch failed for ${sym}:`, e.message);
        }
      }));
      setR2Prices(prices);
    };

    fetchR2();
    const interval = setInterval(fetchR2, 60000);
    return () => clearInterval(interval);
  }, [portfolioItems.length]); // Re-run when portfolio size changes

  // Sync portfolio leg prices from tiles — fires only when TILE PRICES change, not on every Firestore write
  useEffect(() => {
    const currentPortfolioItems = portfolioItemsRef.current;
    if (!currentPortfolioItems || !tiles || currentPortfolioItems.length === 0 || tiles.length === 0) return;

    const syncPrices = async () => {
      for (const portfolioItem of currentPortfolioItems) {
        const tile = tiles.find(t => t.id === portfolioItem.tileId);
        if (!tile || !tile.legs || !portfolioItem.legs) continue;

        // If leg count doesn't match, the portfolio position is outdated - update the entire leg structure
        if (tile.legs.length !== portfolioItem.legs.length) {
          console.log(`⚠️ ${portfolioItem.symbol}: Leg count mismatch (tile=${tile.legs.length}, portfolio=${portfolioItem.legs.length}). Updating entire structure...`);

          // Rebuild legs from tile (leg-count mismatch = full rebuild, entryNetCredit may be recalculated)
          let netEntryCredit = 0;
          const r2SymData = r2Prices[portfolioItem.symbol?.toUpperCase()];
          const newLegs = tile.legs.map((tileLeg, idx) => {
            const entryPremium = tileLeg.entryPrice || tileLeg.premium || 0;
            if (tileLeg.action === 'sell') netEntryCredit += entryPremium * 100;
            else netEntryCredit -= entryPremium * 100;

            const r2Key = `${tileLeg.strike}-${tileLeg.expiry || tile.expiry || ''}-${tileLeg.type}`;
            return {
              legIndex: idx,
              type: tileLeg.type,
              action: tileLeg.action,
              strike: tileLeg.strike,
              expiry: tileLeg.expiry || tile.expiry || null,
              entryPremium: entryPremium,
              currentPremium: tileLeg.currentPrice || r2SymData?.legs?.[r2Key] || 0,
            };
          });

          let netCurrentValue = 0;
          newLegs.forEach(leg => {
            const currentPremium = leg.currentPremium || leg.entryPremium || 0;
            // To close: sell options you bought (receive), buy back options you sold (pay)
            if (leg.action === 'sell') {
              netCurrentValue -= currentPremium * 100; // Pay to buy back
            } else {
              netCurrentValue += currentPremium * 100; // Receive to sell
            }
          });

          const unrealizedPnl = netEntryCredit + netCurrentValue;

          await updatePortfolioItem(portfolioItem.tileId || portfolioItem.id, {
            legs: newLegs,
            entryNetCredit: Math.round(netEntryCredit * 100) / 100,
            currentNetValue: Math.round(netCurrentValue * 100) / 100,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            currentUnderlyingPrice: tile.underlyingPrice || r2Prices[portfolioItem.symbol?.toUpperCase()]?.spot || portfolioItem.currentUnderlyingPrice || 0,
            lastPriceUpdate: new Date().toISOString(),
            strategy: tile.strategy || portfolioItem.strategy,
            expiry: tile.expiry || portfolioItem.expiry,
          });

          console.log(`✅ ${portfolioItem.symbol}: Rebuilt legs and synced prices. P&L=${unrealizedPnl.toFixed(2)}`);
          continue;
        }

        // Legs match in count - sync by index (position in array)
        let hasChanges = false;
        const updatedLegs = portfolioItem.legs.map((portfolioLeg, idx) => {
          const tileLeg = tile.legs[idx];

          // Check if strike/type/action has changed (tile was updated)
          const structureChanged = tileLeg.strike !== portfolioLeg.strike ||
                                   tileLeg.type !== portfolioLeg.type ||
                                   tileLeg.action !== portfolioLeg.action;

          if (structureChanged) {
            // Update the entire leg structure
            const entryPremium = tileLeg.entryPrice || tileLeg.premium || 0;
            hasChanges = true;
            return {
              ...portfolioLeg,
              type: tileLeg.type,
              action: tileLeg.action,
              strike: tileLeg.strike,
              expiry: tileLeg.expiry || tile.expiry || portfolioLeg.expiry,
              entryPremium: entryPremium,
              currentPremium: tileLeg.currentPrice || 0,
            };
          }

          // Only price changed - update currentPremium (tile price or R2 fallback)
          const r2SymData = r2Prices[portfolioItem.symbol?.toUpperCase()];
          const r2LegKey = `${portfolioLeg.strike}-${portfolioLeg.expiry || tile.expiry || ''}-${portfolioLeg.type}`;
          const livePremium = tileLeg.currentPrice || r2SymData?.legs?.[r2LegKey] || null;
          if (livePremium && livePremium !== portfolioLeg.currentPremium) {
            hasChanges = true;
            return { ...portfolioLeg, currentPremium: livePremium };
          }

          return portfolioLeg;
        });

        if (hasChanges) {
          // FIX: Use STORED entryNetCredit — never recalculate it on a price-sync.
          // entryNetCredit was locked in at trade entry and must not change with market prices.
          const storedEntryCredit = portfolioItem.entryNetCredit || 0;

          let netCurrentValue = 0;
          updatedLegs.forEach(leg => {
            const currentPremium = leg.currentPremium || leg.entryPremium || 0;
            if (leg.action === 'sell') {
              netCurrentValue -= currentPremium * 100; // Pay to buy back shorts
            } else {
              netCurrentValue += currentPremium * 100; // Receive to sell longs
            }
          });

          // unrealizedPnl = entryCredit + netCurrentValue
          // (netCurrentValue is negative for cost-to-close, positive if we'd receive on close)
          const unrealizedPnl = storedEntryCredit + netCurrentValue;

          await updatePortfolioItem(portfolioItem.tileId || portfolioItem.id, {
            legs: updatedLegs,
            // NOTE: entryNetCredit intentionally NOT overwritten here — preserved from trade entry
            currentNetValue: Math.round(netCurrentValue * 100) / 100,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            currentUnderlyingPrice: tile.underlyingPrice || r2Prices[portfolioItem.symbol?.toUpperCase()]?.spot || portfolioItem.currentUnderlyingPrice || 0,
            lastPriceUpdate: new Date().toISOString(),
          });

          console.log(`✅ ${portfolioItem.symbol}: Synced prices. storedEntry=$${storedEntryCredit.toFixed(2)} currentNet=$${netCurrentValue.toFixed(2)} P&L=$${unrealizedPnl.toFixed(2)}`);
        }
      }
    };

    syncPrices();
  }, [tiles, updatePortfolioItem, r2Prices]); // r2Prices added to trigger sync when R2 data arrives

  const quantityTimeoutRef = useRef({});

  const getCapitalRequired = useCallback((tile, quantity = 1) => {
    const strategy = (tile.strategy || '').toLowerCase();
    const metrics = calculateMetrics(tile);
    const calculatedMaxLoss = metrics.maxLoss;

    if (strategy.includes('covered') && strategy.includes('call')) {
      const legs = tile.legs || [];
      const putLeg = legs.find(l => l.type === 'put' && l.action === 'buy');
      const currentPrice = tile.currentPrice || tile.underlyingPrice || getUnderlyingPrice(tile);

      if (putLeg && currentPrice) {
        const risk = (currentPrice - putLeg.strike) * 100 * quantity;
        return Math.max(risk, 0);
      }

      const maxLoss = tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss;
      const reasonableMaxLoss = currentPrice * 100 * 0.25;
      return Math.min(maxLoss, reasonableMaxLoss) * quantity;
    }

    const entryCost = tile.lottery?.ticketCost || tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss;
    return entryCost * quantity;
  }, []);

  const getMaxLoss = useCallback((tile, quantity = 1) => {
    const strategy = (tile.strategy || '').toLowerCase();
    const metrics = calculateMetrics(tile);
    const calculatedMaxLoss = metrics.maxLoss;

    if (strategy.includes('covered') && strategy.includes('call')) {
      const legs = tile.legs || [];
      const putLeg = legs.find(l => l.type === 'put' && l.action === 'buy');
      const currentPrice = tile.currentPrice || tile.underlyingPrice || getUnderlyingPrice(tile);

      if (putLeg && currentPrice) {
        const risk = (currentPrice - putLeg.strike) * 100 * quantity;
        return Math.max(risk, 0);
      }

      const maxLoss = tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss;
      const reasonableMaxLoss = currentPrice * 100 * 0.25;
      return Math.min(maxLoss, reasonableMaxLoss) * quantity;
    }

    return (tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss) * quantity;
  }, []);

  const handleOnboardingComplete = () => {
    setOnboardingDone(true);
  };

  // Helper function to determine position status based on P&L and time to expiry
  const getPositionStatus = useCallback((item) => {
    if (item.status === 'closed') return { cls: 'profit', label: '✓ Closed' };
    const dte = item.tile.daysToExpiry || 30;
    const pnl = (item.unrealizedPnl || 0) * (item.quantity || 1);
    const entryCredit = Math.abs(item.entryNetCredit || 0);
    const returnPct = entryCredit > 0 ? (pnl / entryCredit) * 100 : 0;

    // 1. Critical: big loss or about to expire with a loss
    if (returnPct < -50 || (dte <= 3 && pnl < 0)) return { cls: 'danger', label: '🔴 At Risk' };
    // 2. Moderate loss
    if (returnPct < -20 || (pnl < -100)) return { cls: 'warning', label: '⚠ Losing' };
    // 3. Small loss or break-even slipping
    if (pnl < 0) return { cls: 'warning', label: '⚠ Watch' };
    // 4. Approaching expiry (even if profitable)
    if (dte <= 5) return { cls: 'warning', label: '⏰ Expiring' };
    // 5. Profitable — strong gains
    if (pnl > 0 && returnPct > 50) return { cls: 'healthy', label: '● Profitable' };
    // 6. Profitable — on track
    if (pnl > 0) return { cls: 'healthy', label: '● Healthy' };
    // 7. Break-even / no data
    return { cls: 'neutral', label: '● Neutral' };
  }, []);

  const getStatusClass = (item) => getPositionStatus(item).cls;
  const getStatusLabel = (item) => getPositionStatus(item).label;

  // Close a position: lock in P&L, set status to closed
  const handleClosePosition = async (pos) => {
    setClosingId(pos.id);
    try {
      await updatePortfolioItem(pos.tileId || pos.id, {
        status: 'closed',
        realizedPnl: pos.unrealizedPnl || 0,
        closedAt: new Date(),
        closedReason: 'manual',
      });
      setConfirmClose(null);
    } catch (err) {
      console.error('Error closing position:', err);
    } finally {
      setClosingId(null);
    }
  };

  const handleQuantityChange = useCallback((tileId, newQuantity) => {
    if (quantityTimeoutRef.current[tileId]) {
      clearTimeout(quantityTimeoutRef.current[tileId]);
    }

    quantityTimeoutRef.current[tileId] = setTimeout(async () => {
      try {
        await updateQuantity(tileId, newQuantity);
      } catch (err) {
        console.error('Failed to update quantity:', err);
      }
    }, 500);
  }, [updateQuantity]);

  const handleCapitalEdit = () => {
    if (editingCapital && capitalInput) {
      const numericCapital = parseInt(capitalInput.replace(/,/g, ''), 10);
      if (numericCapital >= 5000 && numericCapital <= 10000000) {
        updateSettings({ ...safeSettings, totalCapital: numericCapital });
      }
    }
    setEditingCapital(!editingCapital);
  };

  useEffect(() => {
    if (editingCapital && settings) {
      setCapitalInput(settings.totalCapital.toLocaleString('en-US'));
    }
  }, [editingCapital, settings]);

  const portfolioWithTiles = useMemo(() => {
    return portfolioItems.map(portfolioItem => {
      const tile = tiles.find(t => t.id === portfolioItem.tileId);
      return {
        ...portfolioItem,
        tile: tile || {}
      };
    }).filter(item => item.tile.id);
  }, [portfolioItems, tiles]);

  const filteredPortfolio = useMemo(() => {
    if (statusFilter === 'all') return portfolioWithTiles;
    return portfolioWithTiles.filter(item => item.status === statusFilter);
  }, [portfolioWithTiles, statusFilter]);

  const stats = useMemo(() => {
    const totalPositions = portfolioWithTiles.length;
    const totalCapital = settings?.totalCapital || 0;

    let totalInvested = 0;
    let totalMaxRisk = 0;
    let totalMarginRequired = 0;
    let totalPotentialReturn = 0;
    let totalExpectedProfit = 0;
    let totalProbSum = 0;

    const WIN_TAKE_PCT = 0.60;  // realistic target - traders aim for 60% of max profit
    const LOSS_TAKE_PCT = 1.00; // worst case - lose 100% of max loss (defined risk)

    portfolioWithTiles.forEach(item => {
      const quantity = item.quantity || 1;
      const metrics = calculateMetrics(item.tile);
      const entryCost = getCapitalRequired(item.tile, quantity);
      const maxLoss = getMaxLoss(item.tile, quantity);
      const margin = item.tile.technical?.marginRequired || 0;
      const maxWin = item.tile.maxProfit ?? item.tile.lottery?.maxWin ?? item.tile.technical?.maxProfit ?? metrics.maxProfit;

      // Get probability and validate it's between 0-100
      let rawProb = item.tile.oddsOfProfit || item.tile.probOfProfit || item.tile.lottery?.oddsOfProfit || item.tile.technical?.probability || 50;
      // If probability is already a decimal (< 1), convert to percentage
      if (rawProb > 0 && rawProb <= 1) {
        rawProb = rawProb * 100;
      }
      // Cap probability at 100%
      rawProb = Math.min(Math.max(rawProb, 0), 100);
      const prob = rawProb / 100;

      // Expected profit per tile = (prob × maxProfit × 0.60) - ((1-prob) × maxLoss)
      const profit = maxWin * quantity;
      const loss = maxLoss;
      const tileExpectedProfit = (prob * profit * WIN_TAKE_PCT) - ((1 - prob) * loss * LOSS_TAKE_PCT);

      totalInvested += entryCost;
      totalMaxRisk += maxLoss;
      totalMarginRequired += margin * quantity;
      totalPotentialReturn += maxWin * quantity;
      totalExpectedProfit += tileExpectedProfit;
      totalProbSum += prob;
    });

    const cashAvailable = totalCapital - totalInvested;
    const allocationPct = totalCapital > 0 ? (totalInvested / totalCapital) * 100 : 0;
    const maxAllocation = (settings?.maxAllocation || 0.30) * 100;

    const avgWinRate = portfolioWithTiles.length > 0 ? (totalProbSum / portfolioWithTiles.length) * 100 : 0;
    const expectedWinners = totalProbSum;

    return {
      totalPositions,
      totalCapital,
      totalInvested,
      cashAvailable,
      totalMarginRequired,
      totalMaxRisk,
      totalPotentialReturn,
      totalExpectedProfit,
      expectedWinners,
      allocationPct,
      maxAllocation,
      avgWinRate,
      isOverAllocated: allocationPct > maxAllocation
    };
  }, [portfolioWithTiles, settings, getCapitalRequired, getMaxLoss]);

  const statusCounts = useMemo(() => {
    return {
      all: portfolioWithTiles.length,
      watching: portfolioWithTiles.filter(item => item.status === 'watching').length,
      entered: portfolioWithTiles.filter(item => item.status === 'entered').length,
      closed: portfolioWithTiles.filter(item => item.status === 'closed').length
    };
  }, [portfolioWithTiles]);

  // Fund allocation calculations - MUST BE BEFORE allocationData, strategyBreakdown, scenarioAnalysis
  const allocationStats = useMemo(() => {
    const totalCapital = settings?.totalCapital || 0;
    const maxDrawdown = settings?.maxDrawdown || 0.10;
    const riskBudget = totalCapital * maxDrawdown;

    const activeStrategies = portfolioWithTiles.filter(item => item.status !== 'closed');
    const strategyCount = activeStrategies.length;

    if (strategyCount === 0) {
      return { totalCapital, riskBudget, allocatedAmount: 0, unallocated: riskBudget, strategies: [] };
    }

    // Calculate allocation for each strategy
    const strategies = activeStrategies.map(item => {
      const metrics = calculateMetrics(item.tile);
      const riskPerContract = getMaxLoss(item.tile, 1);

      // Get allocation amount
      let allocationAmount;
      if (autoAllocate) {
        // Equal allocation
        allocationAmount = riskBudget / strategyCount;
      } else {
        // Custom allocation or default
        allocationAmount = customAllocations[item.tileId] || (riskBudget / strategyCount);
      }

      // Calculate contracts based on allocation
      const contracts = riskPerContract > 0 ? Math.max(1, Math.floor(allocationAmount / riskPerContract)) : 1;
      const actualRisk = contracts * riskPerContract;
      const allocationPct = riskBudget > 0 ? (allocationAmount / riskBudget) * 100 : 0;

      return {
        ...item,
        riskPerContract,
        allocationAmount,
        actualRisk,
        contracts,
        allocationPct
      };
    });

    const allocatedAmount = strategies.reduce((sum, s) => sum + s.actualRisk, 0);
    const unallocated = riskBudget - allocatedAmount;

    return {
      totalCapital,
      riskBudget,
      allocatedAmount,
      unallocated,
      strategies,
      allocationPct: riskBudget > 0 ? (allocatedAmount / riskBudget) * 100 : 0
    };
  }, [portfolioWithTiles, settings, autoAllocate, customAllocations, getMaxLoss]);

  const allocationData = useMemo(() => {
    const byStrategy = {};

    // Use allocation stats if available (from Fund Allocation tab), otherwise use actual portfolio
    const dataSource = allocationStats.strategies.length > 0
      ? allocationStats.strategies
      : portfolioWithTiles;

    dataSource.forEach(item => {
      const strategy = item.strategy || 'Unknown';
      // Use actualRisk from allocation stats if available, otherwise calculate from portfolio
      const invested = item.actualRisk || getCapitalRequired(item.tile, item.quantity || 1);

      if (!byStrategy[strategy]) {
        byStrategy[strategy] = { name: strategy, value: 0, count: 0 };
      }
      byStrategy[strategy].value += invested;
      byStrategy[strategy].count += 1;
    });

    return Object.values(byStrategy);
  }, [portfolioWithTiles, allocationStats.strategies, getCapitalRequired]);

  const strategyBreakdown = useMemo(() => {
    const byStrategy = {};

    // Use allocation stats if available (from Fund Allocation tab), otherwise use actual portfolio
    const dataSource = allocationStats.strategies.length > 0
      ? allocationStats.strategies
      : portfolioWithTiles;

    dataSource.forEach(item => {
      const strategy = item.strategy || 'Unknown';
      const quantity = item.contracts || item.quantity || 1; // Use contracts from allocation or actual quantity
      const metrics = calculateMetrics(item.tile);
      const maxRisk = getMaxLoss(item.tile, quantity);
      const maxProfit = (item.tile.maxProfit ?? item.tile.technical?.maxProfit ?? metrics.maxProfit) * quantity;

      if (!byStrategy[strategy]) {
        byStrategy[strategy] = { name: strategy, risk: 0, profit: 0 };
      }
      byStrategy[strategy].risk += maxRisk;
      byStrategy[strategy].profit += maxProfit;
    });

    return Object.values(byStrategy);
  }, [portfolioWithTiles, allocationStats.strategies, getMaxLoss]);

  const scenarioAnalysis = useMemo(() => {
    let bullCase = 0;
    let flatCase = 0;
    let bearCase = 0;

    // Use allocation stats if available (from Fund Allocation tab), otherwise use actual portfolio
    const dataSource = allocationStats.strategies.length > 0
      ? allocationStats.strategies
      : portfolioWithTiles;

    dataSource.forEach(item => {
      const quantity = item.contracts || item.quantity || 1; // Use contracts from allocation or actual quantity
      const metrics = calculateMetrics(item.tile);
      const maxProfit = (item.tile.maxProfit ?? item.tile.technical?.maxProfit ?? metrics.maxProfit) * quantity;
      const maxLoss = getMaxLoss(item.tile, quantity);
      const strategy = item.strategy?.toLowerCase() || '';

      if (strategy.includes('call') && !strategy.includes('spread')) {
        bullCase += maxProfit * 0.8;
        flatCase -= maxLoss * 0.3;
        bearCase -= maxLoss;
      } else if (strategy.includes('put') && !strategy.includes('spread')) {
        bullCase -= maxLoss;
        flatCase -= maxLoss * 0.3;
        bearCase += maxProfit * 0.8;
      } else if (strategy.includes('iron condor')) {
        bullCase -= maxLoss * 0.5;
        flatCase += maxProfit * 0.9;
        bearCase -= maxLoss * 0.5;
      } else if (strategy.includes('spread')) {
        bullCase += maxProfit * 0.4;
        flatCase += maxProfit * 0.2;
        bearCase -= maxLoss * 0.6;
      } else {
        bullCase += maxProfit * 0.3;
        flatCase += maxProfit * 0.5;
        bearCase -= maxLoss * 0.4;
      }
    });

    return [
      { scenario: 'Bull Market', return: bullCase },
      { scenario: 'Flat Market', return: flatCase },
      { scenario: 'Bear Market', return: bearCase }
    ];
  }, [portfolioWithTiles, allocationStats.strategies, getMaxLoss]);

  // Filtered positions for manage mode — uses same logic as status badges
  const filteredPositionsForManage = useMemo(() => {
    if (posFilter === 'all') return portfolioWithTiles;
    if (posFilter === 'profitable') {
      return portfolioWithTiles.filter(item => {
        const status = getPositionStatus(item);
        return status.cls === 'healthy' || status.cls === 'neutral' || status.cls === 'profit';
      });
    }
    if (posFilter === 'at-risk') {
      return portfolioWithTiles.filter(item => {
        const status = getPositionStatus(item);
        return status.cls === 'danger' || status.cls === 'warning';
      });
    }
    return portfolioWithTiles;
  }, [portfolioWithTiles, posFilter, getPositionStatus]);

  // Apply allocations to portfolio
  const applyAllocations = useCallback(async () => {
    try {
      for (const strategy of allocationStats.strategies) {
        if (strategy.contracts !== strategy.quantity) {
          await updateQuantity(strategy.tileId, strategy.contracts);
        }
      }
    } catch (err) {
      console.error('Error applying allocations:', err);
    }
  }, [allocationStats.strategies, updateQuantity]);

  // Adjust allocation for a specific strategy
  const adjustAllocation = useCallback((tileId, direction) => {
    const strategy = allocationStats.strategies.find(s => s.tileId === tileId);
    if (!strategy) return;

    const step = strategy.riskPerContract; // Adjust by one contract worth
    const currentAllocation = customAllocations[tileId] || strategy.allocationAmount;
    const newAllocation = direction === 'increase'
      ? currentAllocation + step
      : Math.max(step, currentAllocation - step); // Minimum 1 contract

    setCustomAllocations(prev => ({
      ...prev,
      [tileId]: newAllocation
    }));
    setAutoAllocate(false); // Disable auto-allocate when manually adjusting
  }, [allocationStats.strategies, customAllocations]);

  // Reset allocations to equal
  const resetToEqualAllocation = useCallback(() => {
    setCustomAllocations({});
    setAutoAllocate(true);
  }, []);

  // Adjust total capital
  const adjustCapital = useCallback((direction) => {
    const currentCapital = settings?.totalCapital || 0;
    const step = 10000; // Adjust by $10k increments
    const newCapital = direction === 'increase'
      ? currentCapital + step
      : Math.max(5000, currentCapital - step); // Minimum $5k

    updateSettings({ ...settings, totalCapital: newCapital });
  }, [settings, updateSettings]);

  // Adjust risk percentage
  const adjustRiskPct = useCallback((direction) => {
    const currentPct = (settings?.maxDrawdown || 0.10) * 100;
    const step = 1; // Adjust by 1% increments
    const newPct = direction === 'increase'
      ? Math.min(25, currentPct + step) // Max 25%
      : Math.max(1, currentPct - step); // Min 1%

    updateSettings({ ...settings, maxDrawdown: newPct / 100 });
  }, [settings, updateSettings]);

  // Save edited capital
  const saveCapitalEdit = useCallback(() => {
    const numericValue = parseInt(tempCapital.replace(/,/g, ''), 10);
    if (!isNaN(numericValue) && numericValue >= 5000) {
      updateSettings({ ...settings, totalCapital: numericValue });
    }
    setEditingTotalCapital(false);
  }, [tempCapital, settings, updateSettings]);

  // Save edited risk percentage
  const saveRiskPctEdit = useCallback(() => {
    const numericValue = parseFloat(tempRiskPct);
    if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 25) {
      updateSettings({ ...settings, maxDrawdown: numericValue / 100 });
    }
    setEditingRiskPct(false);
  }, [tempRiskPct, settings, updateSettings]);

  const handleStatusChange = async (tileId, newStatus) => {
    try {
      await updateStatus(tileId, newStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleRemove = async (tileId, symbol) => {
    setConfirmDelete({ tileId, symbol });
  };

  const confirmRemove = async () => {
    if (!confirmDelete) return;
    try {
      await removeFromPortfolio(confirmDelete.tileId);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Failed to remove from portfolio:', err);
    }
  };

  const formatCurrency = (value) => {
    if (!value || isNaN(value)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(Math.abs(value));
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Recently';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  };

  const getDaysLeftColor = (days) => {
    if (days > 14) return 'green';
    if (days >= 7) return 'amber';
    return 'red';
  };

  if (loading || settingsLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">🍃</div>
        <p className="loading-text">Loading your portfolio...</p>
      </div>
    );
  }

  const statusFilterTabs = [
    { value: 'all', label: `All${statusCounts.all > 0 ? ` (${statusCounts.all})` : ''}` },
    { value: 'watching', label: `Watching${statusCounts.watching > 0 ? ` (${statusCounts.watching})` : ''}` },
    { value: 'entered', label: `Entered${statusCounts.entered > 0 ? ` (${statusCounts.entered})` : ''}` },
    { value: 'closed', label: `Closed${statusCounts.closed > 0 ? ` (${statusCounts.closed})` : ''}` },
  ];

  return (
    <>
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      <div className="nl-page">
        {/* Page Header */}
        <div className="nl-page-header">
          <div>
            <h1 className="nl-page-title">Portfolio Builder</h1>
            <p className="nl-page-subtitle">
              Allocate risk budgets, size strategies, and keep compounding cycles consistent.
            </p>
          </div>
          <SegmentedTabs
            tabs={[{ value: 'build', label: 'Build' }, { value: 'manage', label: 'Manage' }]}
            activeTab={buildManageMode}
            onChange={setBuildManageMode}
          />
        </div>

        {/* KPI Row */}
        <div className="nl-portfolio-kpis nl-mb-md">
          <KpiCard
            label="Expected Profit"
            value={`${stats.totalExpectedProfit >= 0 ? '+' : ''}$${Math.abs(stats.totalExpectedProfit).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            subtitle="per monthly cycle (EV-based)"
            variant={stats.totalExpectedProfit >= 0 ? "softGreen" : "softRed"}
          />
          <KpiCard
            label="Scenario"
            value={`~${Math.round(stats.expectedWinners)} of ${stats.totalPositions} win`}
            subtitle={`avg ${(stats.avgWinRate || 0).toFixed(0)}% probability`}
            variant="softBlue"
          />
          <KpiCard
            label="Max Gain"
            value={formatCurrency(stats.totalPotentialReturn)}
            subtitle="if all strategies hit max"
          />
          <KpiCard
            label="Max Risk"
            value={formatCurrency(stats.totalMaxRisk)}
            subtitle={`${(stats.allocationPct || 0).toFixed(1)}% of risk budget`}
          />
          <KpiCard
            label="Risk Budget"
            value={`$${stats.totalCapital.toLocaleString('en-US')}`}
            subtitle="max 10% drawdown"
          />
        </div>

        {portfolioWithTiles.length === 0 ? (
          <div className="nl-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <svg width="64" height="64" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 16px' }}>
              <path d="M20 4C12 4 6 12 6 20C6 28 10 36 20 36C30 36 34 28 34 20C34 12 28 4 20 4Z" fill="#bbf7d0" opacity="0.5"/>
              <path d="M20 8C14 8 10 14 10 20C10 26 13 32 20 32C27 32 30 26 30 20C30 14 26 8 20 8Z" fill="#86efac" opacity="0.7"/>
              <path d="M20 12C16 12 14 16 14 20C14 24 16.5 28 20 28C23.5 28 26 24 26 20C26 16 24 12 20 12Z" fill="#22c55e"/>
              <path d="M18 16C17 18 17 22 18 24C19 26 21 26 22 24C23 22 23 18 22 16C21 14 19 14 18 16Z" fill="#15803d"/>
            </svg>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '900' }}>Your portfolio is empty</h2>
            <p style={{ margin: '0 0 20px', color: 'var(--nl-muted-text)', fontSize: '13px' }}>
              Browse opportunities and tap the bookmark icon to start building your portfolio
            </p>
            <Button variant="primary" onClick={() => navigate('/invest/discover')}>
              Discover Opportunities
            </Button>
          </div>
        ) : buildManageMode === 'build' ? (
          <>
            <SegmentedTabs tabs={statusFilterTabs} activeTab={statusFilter} onChange={setStatusFilter} className="nl-mb-md" />

            <div className="card-grid">
                  {filteredPortfolio.map((item) => {
                    const { tile } = item;
                    const quantity = item.quantity || 1;
                    const metrics = calculateMetrics(tile);
                    const maxWin = tile.maxProfit ?? tile.lottery?.maxWin ?? tile.technical?.maxProfit ?? metrics.maxProfit;
                    const entryCost = getCapitalRequired(tile, 1);
                    const winRate = tile.oddsOfProfit || tile.probOfProfit || tile.lottery?.oddsOfProfit || tile.technical?.probability || 0;
                    const daysLeft = tile.daysToExpiry || 0;
                    const daysColor = getDaysLeftColor(daysLeft);

                    const totalCost = entryCost * quantity;
                    const totalProfit = maxWin * quantity;

                    return (
                      <div key={item.id} className={`portfolio-card ${getThemeClass(item.strategy)}`}>
                        <div className="pf-card-header">
                          <div>
                            <h3 className="pf-card-ticker">{item.symbol}</h3>
                            <div className="pf-card-badge">{formatStrategy(item.strategy)}</div>
                          </div>
                          <select
                            className={`pf-status-select status-${item.status}`}
                            value={item.status}
                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="watching">Watching</option>
                            <option value="entered">Entered</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>

                        <div className="pf-card-added">
                          <span className="pf-added-label">ADDED</span>
                          <span className="pf-added-time">{formatRelativeTime(item.addedAt)}</span>
                        </div>

                        <div className="contract-controls">
                          <span className="contract-label">Contracts</span>
                          <div className="contract-buttons">
                            <button
                              className="contract-btn"
                              onClick={() => {
                                const newQty = Math.max(1, quantity - 1);
                                handleQuantityChange(item.id, newQty);
                              }}
                              disabled={quantity <= 1}
                            >
                              −
                            </button>
                            <span className="contract-quantity">{quantity}</span>
                            <button
                              className="contract-btn"
                              onClick={() => {
                                const newQty = Math.min(50, quantity + 1);
                                handleQuantityChange(item.id, newQty);
                              }}
                              disabled={quantity >= 50}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="pf-stats-grid">
                          <div className="pf-stat">
                            <div className="pf-stat-label">Total Cost</div>
                            <div className="pf-stat-value">{formatCurrency(totalCost)}</div>
                          </div>
                          <div className="pf-stat">
                            <div className="pf-stat-label">Total Profit</div>
                            <div className="pf-stat-value profit">{formatCurrency(totalProfit)}</div>
                          </div>
                          <div className="pf-stat">
                            <div className="pf-stat-label">Win Rate</div>
                            <div className="pf-stat-value">{(winRate || 0).toFixed(0)}%</div>
                          </div>
                          <div className="pf-stat">
                            <div className="pf-stat-label">Days Left</div>
                            <div className={`pf-stat-value ${daysColor}`}>{daysLeft}d</div>
                          </div>
                        </div>

                        {winRate > 0 && (
                          <div className="pf-prob-bar">
                            <div className="pf-prob-track">
                              <div className="pf-prob-fill" style={{ width: `${winRate}%` }}></div>
                            </div>
                            <div className="pf-prob-labels">
                              <span className="pf-prob-risk">{(100 - (winRate || 0)).toFixed(0)}% risk</span>
                              <span className="pf-prob-success">{(winRate || 0).toFixed(0)}% probability</span>
                            </div>
                          </div>
                        )}

                        <div className="pf-card-footer">
                          <button
                            className="pf-view-btn"
                            onClick={() => navigate(`/invest/position/${tile.id}`)}
                          >
                            View Analysis
                          </button>
                          <button
                            className="pf-remove-btn"
                            onClick={() => handleRemove(item.id, item.symbol)}
                            aria-label="Remove from portfolio"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
          </>
        ) : (
          <>
            {/* Manage Mode: Active Positions, Fund Allocation, Allocation & Risk Summary */}
            <SegmentedTabs
              tabs={[
                { value: 'positions', label: 'Active Positions' },
                { value: 'fund-allocation', label: 'Fund Allocation' },
                { value: 'allocation', label: 'Portfolio Mix' },
                { value: 'risk', label: 'Risk Summary' }
              ]}
              activeTab={viewTab}
              onChange={setViewTab}
              className="nl-mb-md"
            />

            {viewTab === 'positions' && (
              <div style={{ width: '100%' }}>
                <div style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Active Positions</h3>
                    <div className="pos-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={async () => {
                          // Debug Sync: Force recalculate P&L using STORED entryNetCredit (fixed version)
                          console.log('=== Manual Price Sync (Force Recalculate) ===');
                          const items = portfolioItemsRef.current;
                          console.log('Portfolio items:', items.length);
                          console.log('Tiles:', tiles.length);

                          for (const portfolioItem of items) {
                            const tile = tiles.find(t => t.id === portfolioItem.tileId);
                            if (!tile || !tile.legs || !portfolioItem.legs) continue;

                            console.log(`\n${portfolioItem.symbol}:`);
                            console.log(`  Stored entryNetCredit: $${(portfolioItem.entryNetCredit || 0).toFixed(2)}`);

                            // Force-pull current prices from tile legs
                            const updatedLegs = portfolioItem.legs.map((portfolioLeg, idx) => {
                              const tileLeg = tile.legs[idx];
                              const currentPremium = tileLeg?.currentPrice || portfolioLeg.currentPremium || portfolioLeg.entryPremium || 0;
                              return { ...portfolioLeg, currentPremium };
                            });

                            // FIX: Use stored entryNetCredit, never recalculate from leg data
                            const storedEntryCredit = portfolioItem.entryNetCredit || 0;
                            let netCurrentValue = 0;

                            updatedLegs.forEach(leg => {
                              const currentPremium = leg.currentPremium || leg.entryPremium || 0;
                              if (leg.action === 'sell') {
                                netCurrentValue -= currentPremium * 100; // Pay to buy back shorts
                              } else {
                                netCurrentValue += currentPremium * 100; // Receive to sell longs
                              }
                            });

                            const unrealizedPnl = storedEntryCredit + netCurrentValue;

                            console.log(`  Entry Credit (stored): $${storedEntryCredit.toFixed(2)}`);
                            console.log(`  Current Net Value: $${netCurrentValue.toFixed(2)}`);
                            console.log(`  Unrealized P&L: $${unrealizedPnl.toFixed(2)}`);

                            await updatePortfolioItem(portfolioItem.tileId || portfolioItem.id, {
                              legs: updatedLegs,
                              // entryNetCredit intentionally NOT overwritten
                              currentNetValue: Math.round(netCurrentValue * 100) / 100,
                              unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
                              currentUnderlyingPrice: tile.underlyingPrice || portfolioItem.currentUnderlyingPrice || 0,
                              lastPriceUpdate: new Date().toISOString(),
                            });

                            console.log(`✅ ${portfolioItem.symbol}: P&L = $${unrealizedPnl.toFixed(2)}`);
                          }

                          alert('P&L recalculated! Check console for details.');
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #2563eb',
                          background: '#eff6ff',
                          color: '#2563eb',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        🔄 Debug Sync
                      </button>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                        fontSize: '13px', color: '#6b7280'
                      }}>
                        <input
                          type="checkbox"
                          checked={showLegs}
                          onChange={e => {
                            setShowLegs(e.target.checked);
                            if (!e.target.checked) setExpandedPos(new Set());
                          }}
                          style={{ width: '14px', height: '14px' }}
                        />
                        <span>Show Legs</span>
                      </label>
                      <div style={{
                        display: 'flex',
                        background: '#f3f4f6',
                        borderRadius: '6px',
                        padding: '3px',
                        gap: '2px'
                      }}>
                        <button
                          onClick={() => setPosFilter('all')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: posFilter === 'all' ? '#fff' : 'transparent',
                            color: posFilter === 'all' ? '#1a1a2e' : '#9ca3af',
                            boxShadow: posFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                          }}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setPosFilter('profitable')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: posFilter === 'profitable' ? '#fff' : 'transparent',
                            color: posFilter === 'profitable' ? '#1a1a2e' : '#9ca3af',
                            boxShadow: posFilter === 'profitable' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                          }}
                        >
                          Profitable
                        </button>
                        <button
                          onClick={() => setPosFilter('at-risk')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: posFilter === 'at-risk' ? '#fff' : 'transparent',
                            color: posFilter === 'at-risk' ? '#1a1a2e' : '#9ca3af',
                            boxShadow: posFilter === 'at-risk' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                          }}
                        >
                          At Risk
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: showLegs ? '24px 120px 160px 120px 120px 140px 80px' : '120px 160px 120px 120px 140px 80px',
                    gap: '12px',
                    padding: '12px 16px',
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '11px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#6b7280'
                  }}>
                    {showLegs && <div></div>}
                    <div>Ticker</div>
                    <div>Strategy</div>
                    <div>P&L</div>
                    <div>Return</div>
                    <div>Status</div>
                    <div></div>
                  </div>

                  {/* Table Body */}
                  {filteredPositionsForManage.length === 0 ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: '#9ca3af'
                    }}>
                      {posFilter === 'profitable'
                        ? 'No profitable positions yet. Add trades from Build mode or update current prices in Admin to track P&L.'
                        : posFilter === 'at-risk'
                          ? 'No at-risk positions — looking good! All your trades are healthy.'
                          : 'No positions found.'}
                    </div>
                  ) : filteredPositionsForManage.map(item => {
                    const pnl = (item.unrealizedPnl || 0) * (item.quantity || 1);
                    const entryCredit = item.entryNetCredit || 0;
                    const pnlPct = entryCredit !== 0 ? ((pnl / Math.abs(entryCredit)) * 100).toFixed(1) : '0.0';
                    const isExpanded = showLegs && expandedPos.has(item.id);
                    const hasLegs = item.legs && item.legs.length > 0;

                    return (
                      <div key={item.id}>
                        <div
                          onClick={() => {
                            if (showLegs && hasLegs) {
                              setExpandedPos(prev => {
                                const n = new Set(prev);
                                n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                                return n;
                              });
                            } else {
                              navigate(`/invest/position/${item.tile.id}`);
                            }
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: showLegs ? '24px 120px 160px 120px 120px 140px 80px' : '120px 160px 120px 120px 140px 80px',
                            gap: '12px',
                            padding: '16px',
                            borderBottom: '1px solid #f3f4f6',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            background: isExpanded ? '#f9fafb' : '#fff'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.background = isExpanded ? '#f9fafb' : '#fff'}
                        >
                          {showLegs && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              color: '#9ca3af'
                            }}>
                              {hasLegs ? (isExpanded ? '▼' : '▶') : '—'}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>{item.symbol}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                              {item.status === 'closed' ? 'Closed' : `${item.tile.daysToExpiry || 0} DTE`}
                            </div>
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {formatStrategy(item.strategy)}
                          </div>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: pnl >= 0 ? '#10b981' : '#ef4444'
                          }}>
                            {pnl > 0 ? '+' : ''}{formatCurrency(pnl)}
                          </div>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: parseFloat(pnlPct) >= 0 ? '#10b981' : '#ef4444'
                          }}>
                            {parseFloat(pnlPct) > 0 ? '+' : ''}{pnlPct}%
                          </div>
                          <div>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600',
                              background: getStatusClass(item) === 'healthy' ? '#ecfdf5'
                                : getStatusClass(item) === 'danger' ? '#fef2f2'
                                : getStatusClass(item) === 'warning' ? '#fffbeb'
                                : '#f3f4f6',
                              color: getStatusClass(item) === 'healthy' ? '#059669'
                                : getStatusClass(item) === 'danger' ? '#dc2626'
                                : getStatusClass(item) === 'warning' ? '#d97706'
                                : '#6b7280'
                            }}>
                              {getStatusLabel(item)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                            {item.status !== 'closed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmClose(item);
                                }}
                                disabled={closingId === item.id}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#ef4444',
                                  color: '#fff',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  cursor: closingId === item.id ? 'not-allowed' : 'pointer',
                                  opacity: closingId === item.id ? 0.6 : 1
                                }}
                              >
                                {closingId === item.id ? '...' : 'Close'}
                              </button>
                            )}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/invest/position/${item.tile.id}`);
                              }}
                              style={{
                                fontSize: '20px',
                                color: '#9ca3af',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              ›
                            </div>
                          </div>
                        </div>

                        {/* Expanded Leg Details */}
                        {isExpanded && hasLegs && (
                          <div style={{
                            padding: '16px',
                            background: '#f9fafb',
                            borderBottom: '1px solid #e5e7eb'
                          }}>
                            <table style={{
                              width: '100%',
                              fontSize: '12px',
                              borderCollapse: 'collapse'
                            }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>Type</th>
                                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>Action</th>
                                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#6b7280' }}>Strike</th>
                                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#6b7280' }}>Entry $</th>
                                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#6b7280' }}>Current $</th>
                                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#6b7280' }}>Leg P&L</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.legs.map((leg, idx) => {
                                  const legPnlPerContract = leg.action === 'sell'
                                    ? (leg.entryPremium - (leg.currentPremium || 0)) * 100
                                    : ((leg.currentPremium || 0) - leg.entryPremium) * 100;
                                  const legPnl = legPnlPerContract * (item.quantity || 1);
                                  const hasCurrent = (leg.currentPremium || 0) > 0;
                                  return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                      <td style={{ padding: '8px' }}>
                                        <span style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: '600',
                                          background: leg.type === 'call' ? '#dbeafe' : '#fce7f3',
                                          color: leg.type === 'call' ? '#1e40af' : '#9f1239'
                                        }}>
                                          {leg.type === 'call' ? '↗ Call' : leg.type === 'put' ? '↘ Put' : '● Stock'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px' }}>
                                        <span style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: '600',
                                          background: leg.action === 'sell' ? '#fee2e2' : '#dcfce7',
                                          color: leg.action === 'sell' ? '#991b1b' : '#166534'
                                        }}>
                                          {leg.action === 'sell' ? 'SELL' : 'BUY'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>${leg.strike}</td>
                                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>${(leg.entryPremium || 0).toFixed(2)}</td>
                                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                        {hasCurrent ? `$${(leg.currentPremium || 0).toFixed(2)}` : '—'}
                                      </td>
                                      <td style={{
                                        padding: '8px',
                                        textAlign: 'right',
                                        fontFamily: 'monospace',
                                        fontWeight: '600',
                                        color: legPnl > 0 ? '#10b981' : legPnl < 0 ? '#ef4444' : '#6b7280'
                                      }}>
                                        {hasCurrent ? `${legPnl >= 0 ? '+' : ''}$${legPnl.toFixed(0)}` : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: '600' }}>
                                  <td colSpan="3" style={{ padding: '8px', textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>Net:</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                    {entryCredit !== 0 ? formatCurrency(Math.abs(entryCredit)) : '—'}
                                  </td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                    {item.currentNetValue ? formatCurrency(Math.abs(item.currentNetValue)) : '—'}
                                  </td>
                                  <td style={{
                                    padding: '8px',
                                    textAlign: 'right',
                                    fontFamily: 'monospace',
                                    fontWeight: '700',
                                    color: pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : '#6b7280'
                                  }}>
                                    {pnl !== 0 ? `${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}` : '—'}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                        {isExpanded && !hasLegs && (
                          <div style={{
                            padding: '16px',
                            background: '#f9fafb',
                            borderBottom: '1px solid #e5e7eb',
                            textAlign: 'center',
                            fontSize: '12px',
                            color: '#9ca3af'
                          }}>
                            No legs data — sync from Admin → Portfolios tab
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {viewTab === 'fund-allocation' && (
              <div style={{ width: '100%' }}>
                {/* Summary Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px',
                  marginBottom: '20px'
                }}>
                  {/* Total Capital Card with Edit Controls */}
                  <div style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px'
                    }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>Total Capital</div>
                      {!editingTotalCapital && (
                        <button
                          onClick={() => {
                            setTempCapital(allocationStats.totalCapital.toString());
                            setEditingTotalCapital(true);
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            background: '#fff',
                            fontSize: '10px',
                            color: '#6b7280',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingTotalCapital ? (
                      <div>
                        <input
                          type="text"
                          value={tempCapital}
                          onChange={(e) => setTempCapital(e.target.value.replace(/[^0-9]/g, ''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveCapitalEdit();
                            if (e.key === 'Escape') setEditingTotalCapital(false);
                          }}
                          style={{
                            width: '100%',
                            fontSize: '20px',
                            fontWeight: '700',
                            padding: '4px 8px',
                            border: '2px solid #2563eb',
                            borderRadius: '6px',
                            marginBottom: '6px'
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={saveCapitalEdit}
                            style={{
                              flex: 1,
                              padding: '4px',
                              borderRadius: '4px',
                              border: 'none',
                              background: '#059669',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingTotalCapital(false)}
                            style={{
                              flex: 1,
                              padding: '4px',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              color: '#6b7280',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e', marginBottom: '6px' }}>
                          {formatCurrency(allocationStats.totalCapital)}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => adjustCapital('decrease')}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            − $10K
                          </button>
                          <button
                            onClick={() => adjustCapital('increase')}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            + $10K
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Risk Budget Card with Edit Controls */}
                  <div style={{
                    background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid #93c5fd'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px'
                    }}>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Risk Budget</div>
                      {!editingRiskPct && (
                        <button
                          onClick={() => {
                            setTempRiskPct(((settings?.maxDrawdown || 0.10) * 100).toFixed(0));
                            setEditingRiskPct(true);
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #93c5fd',
                            background: '#fff',
                            fontSize: '10px',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingRiskPct ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <input
                            type="text"
                            value={tempRiskPct}
                            onChange={(e) => setTempRiskPct(e.target.value.replace(/[^0-9.]/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRiskPctEdit();
                              if (e.key === 'Escape') setEditingRiskPct(false);
                            }}
                            style={{
                              width: '60px',
                              fontSize: '20px',
                              fontWeight: '700',
                              padding: '4px 8px',
                              border: '2px solid #2563eb',
                              borderRadius: '6px'
                            }}
                            autoFocus
                          />
                          <span style={{ fontSize: '20px', fontWeight: '700', color: '#2563eb' }}>%</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={saveRiskPctEdit}
                            style={{
                              flex: 1,
                              padding: '4px',
                              borderRadius: '4px',
                              border: 'none',
                              background: '#2563eb',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingRiskPct(false)}
                            style={{
                              flex: 1,
                              padding: '4px',
                              borderRadius: '4px',
                              border: '1px solid #93c5fd',
                              background: '#fff',
                              color: '#2563eb',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#2563eb', marginBottom: '2px' }}>
                          {formatCurrency(allocationStats.riskBudget)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                          {((settings?.maxDrawdown || 0.10) * 100).toFixed(0)}% of capital
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => adjustRiskPct('decrease')}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid #93c5fd',
                              background: '#fff',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: '#2563eb',
                              cursor: 'pointer'
                            }}
                          >
                            − 1%
                          </button>
                          <button
                            onClick={() => adjustRiskPct('increase')}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid #93c5fd',
                              background: '#fff',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: '#2563eb',
                              cursor: 'pointer'
                            }}
                          >
                            + 1%
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{
                    background: allocationStats.allocatedAmount > allocationStats.riskBudget
                      ? 'linear-gradient(135deg, #fef2f2, #fecaca)'
                      : 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: `1px solid ${allocationStats.allocatedAmount > allocationStats.riskBudget ? '#fca5a5' : '#a7f3d0'}`
                  }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Allocated</div>
                    <div style={{
                      fontSize: '24px',
                      fontWeight: '700',
                      color: allocationStats.allocatedAmount > allocationStats.riskBudget ? '#dc2626' : '#059669'
                    }}>
                      {formatCurrency(allocationStats.allocatedAmount)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                      {(allocationStats.allocationPct || 0).toFixed(1)}% of budget
                    </div>
                  </div>
                  <div style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Unallocated</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#6b7280' }}>
                      {formatCurrency(allocationStats.unallocated)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                      {(allocationStats.riskBudget > 0 ? ((allocationStats.unallocated / allocationStats.riskBudget) * 100) : 0).toFixed(1)}% remaining
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  marginBottom: '20px'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={autoAllocate}
                      onChange={(e) => {
                        setAutoAllocate(e.target.checked);
                        if (e.target.checked) {
                          setCustomAllocations({});
                        }
                      }}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
                        ⚖️ Auto-allocate equally
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        Distribute risk budget evenly across all {allocationStats.strategies.length} strategies
                      </div>
                    </div>
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={resetToEqualAllocation}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#6b7280',
                        cursor: 'pointer'
                      }}
                    >
                      Reset to Equal
                    </button>
                    <button
                      onClick={applyAllocations}
                      style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#059669',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#fff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(5,150,105,0.2)'
                      }}
                    >
                      Apply to Portfolio
                    </button>
                  </div>
                </div>

                {/* Allocation Table */}
                <div style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '200px 1fr 140px 120px 120px 140px',
                    gap: '16px',
                    padding: '16px 20px',
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '11px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#6b7280'
                  }}>
                    <div>Strategy</div>
                    <div>Risk per Contract</div>
                    <div style={{ textAlign: 'center' }}>Allocation</div>
                    <div style={{ textAlign: 'right' }}>Amount</div>
                    <div style={{ textAlign: 'right' }}>Contracts</div>
                    <div style={{ textAlign: 'right' }}>% of Budget</div>
                  </div>

                  {/* Rows */}
                  {allocationStats.strategies.length === 0 ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: '#9ca3af'
                    }}>
                      No active strategies. Add positions from Build mode.
                    </div>
                  ) : allocationStats.strategies.map((strategy) => (
                    <div
                      key={strategy.tileId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '200px 1fr 140px 120px 120px 140px',
                        gap: '16px',
                        padding: '20px',
                        borderBottom: '1px solid #f3f4f6',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e', marginBottom: '4px' }}>
                          {strategy.symbol}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {formatStrategy(strategy.strategy)}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        {formatCurrency(strategy.riskPerContract)} per contract
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}>
                        <button
                          onClick={() => adjustAllocation(strategy.tileId, 'decrease')}
                          disabled={autoAllocate}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            background: autoAllocate ? '#f3f4f6' : '#fff',
                            fontSize: '16px',
                            fontWeight: '700',
                            color: autoAllocate ? '#9ca3af' : '#374151',
                            cursor: autoAllocate ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          −
                        </button>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#1a1a2e',
                          minWidth: '40px',
                          textAlign: 'center'
                        }}>
                          {strategy.contracts}×
                        </div>
                        <button
                          onClick={() => adjustAllocation(strategy.tileId, 'increase')}
                          disabled={autoAllocate}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            background: autoAllocate ? '#f3f4f6' : '#fff',
                            fontSize: '16px',
                            fontWeight: '700',
                            color: autoAllocate ? '#9ca3af' : '#374151',
                            cursor: autoAllocate ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#059669',
                        textAlign: 'right'
                      }}>
                        {formatCurrency(strategy.actualRisk)}
                      </div>
                      <div style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#1a1a2e',
                        textAlign: 'right'
                      }}>
                        {strategy.contracts}
                      </div>
                      <div style={{
                        textAlign: 'right'
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: '#2563eb'
                        }}>
                          {(strategy.allocationPct || 0).toFixed(1)}%
                        </div>
                        <div style={{
                          width: '100%',
                          height: '4px',
                          background: '#f3f4f6',
                          borderRadius: '2px',
                          marginTop: '6px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.min(strategy.allocationPct, 100)}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                            borderRadius: '2px'
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Warning if over-allocated */}
                {allocationStats.allocatedAmount > allocationStats.riskBudget && (
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{ fontSize: '24px' }}>⚠️</div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626', marginBottom: '4px' }}>
                        Over Risk Budget
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        You're allocating {formatCurrency(allocationStats.allocatedAmount)} but your risk budget is only {formatCurrency(allocationStats.riskBudget)}.
                        Reduce allocation or increase your risk tolerance in settings.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {viewTab === 'allocation' && (
              <div className="allocation-view">
                <div className="allocation-charts">
                  <div className="allocation-donut-section">
                    <h3 className="section-heading">Portfolio Allocation by Strategy</h3>
                    {allocationData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={allocationData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {allocationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={getChartColor(entry.name)} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                          />
                          <Legend
                            iconType="circle"
                            formatter={(value) => formatStrategy(value)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="empty-chart-message">No allocation data available</p>
                    )}
                  </div>

                  <div className="allocation-table-section">
                    <h3 className="section-heading">Strategy Breakdown</h3>
                    <table className="allocation-table">
                      <thead>
                        <tr>
                          <th>Strategy</th>
                          <th>Positions</th>
                          <th>Amount</th>
                          <th>% of Portfolio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocationData.map((item, idx) => {
                          const percentage = stats.totalInvested > 0 ? (item.value / stats.totalInvested) * 100 : 0;
                          const color = getChartColor(item.name);
                          return (
                            <tr key={idx}>
                              <td>
                                <span className="strategy-color-dot" style={{ backgroundColor: color }}></span>
                                {formatStrategy(item.name)}
                              </td>
                              <td>{item.count}</td>
                              <td className="amount">${item.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td>{(percentage || 0).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {viewTab === 'risk' && (
              <div className="risk-view">
                <div className="risk-gauges">
                  <div className="risk-gauge-card">
                    <h4 className="gauge-title">Portfolio Risk Score</h4>
                    <div className="gauge-value-large">
                      {(stats.totalCapital > 0 ? ((stats.totalMaxRisk / stats.totalCapital) * 100) : 0).toFixed(1)}%
                    </div>
                    <div className="gauge-label">of total capital at risk</div>
                    <div className="gauge-bar">
                      <div
                        className={`gauge-fill ${(stats.totalMaxRisk / stats.totalCapital) > 0.15 ? 'high' : 'normal'}`}
                        style={{ width: `${Math.min(((stats.totalMaxRisk / stats.totalCapital) * 100), 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="risk-gauge-card">
                    <h4 className="gauge-title">Win Rate Average</h4>
                    <div className="gauge-value-large">{(stats.avgWinRate || 0).toFixed(1)}%</div>
                    <div className="gauge-label">probability of profit</div>
                    <div className="gauge-bar">
                      <div className="gauge-fill normal" style={{ width: `${stats.avgWinRate}%` }}></div>
                    </div>
                  </div>

                  <div className="risk-gauge-card">
                    <h4 className="gauge-title">Return Potential</h4>
                    <div className="gauge-value-large">
                      {stats.totalInvested > 0 ? ((stats.totalPotentialReturn / stats.totalInvested) * 100).toFixed(0) : 0}%
                    </div>
                    <div className="gauge-label">potential ROI</div>
                    <div className="gauge-bar">
                      <div
                        className="gauge-fill profit"
                        style={{ width: `${Math.min(stats.totalInvested > 0 ? ((stats.totalPotentialReturn / stats.totalInvested) * 100) : 0, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="risk-chart-section">
                  <h3 className="section-heading">Risk & Reward by Strategy</h3>
                  {strategyBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={strategyBreakdown}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} />
                        <Legend />
                        <Bar dataKey="profit" fill="#10b981" name="Max Profit" />
                        <Bar dataKey="risk" fill="#ef4444" name="Max Risk" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="empty-chart-message">No strategy data available</p>
                  )}
                </div>

                <div className="scenario-section">
                  <h3 className="section-heading">Market Scenario Analysis</h3>
                  <div className="scenario-cards">
                    {scenarioAnalysis.map((scenario, idx) => {
                      const isPositive = scenario.return >= 0;
                      return (
                        <div key={idx} className={`scenario-card ${scenario.scenario.toLowerCase().includes('bull') ? 'bull' : scenario.scenario.toLowerCase().includes('bear') ? 'bear' : 'flat'}`}>
                          <div className="scenario-icon">
                            {scenario.scenario.includes('Bull') && '📈'}
                            {scenario.scenario.includes('Flat') && '➡️'}
                            {scenario.scenario.includes('Bear') && '📉'}
                          </div>
                          <h4 className="scenario-title">{scenario.scenario}</h4>
                          <div className={`scenario-value ${isPositive ? 'positive' : 'negative'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(scenario.return)}
                          </div>
                          <div className="scenario-label">Estimated P&L</div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="scenario-disclaimer">
                    * Scenario estimates are simplified projections based on strategy characteristics and do not account for volatility changes, early assignment, or other market dynamics.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {confirmDelete && (
          <div className="confirm-dialog-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3 className="confirm-title">Remove from Portfolio?</h3>
              <p className="confirm-message">
                Remove <strong>{confirmDelete.symbol}</strong> from your portfolio?
              </p>
              <div className="confirm-actions">
                <button className="confirm-btn cancel" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="confirm-btn confirm" onClick={confirmRemove}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Close Position Confirmation Dialog */}
        {confirmClose && (
          <div className="confirm-dialog-overlay" onClick={() => setConfirmClose(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3 className="confirm-title">Close Position?</h3>
              <p className="confirm-message">
                Close <strong>{confirmClose.symbol} {formatStrategy(confirmClose.strategy || '')}</strong> and lock in the current P&L of{' '}
                <strong style={{ color: (confirmClose.unrealizedPnl || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {(confirmClose.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency((confirmClose.unrealizedPnl || 0) * (confirmClose.quantity || 1))}
                </strong>?
              </p>
              <p style={{ margin: '0 0 16px', fontSize: '11px', color: '#9ca3af' }}>
                This will move the position to Closed Trades History with today's date.
              </p>
              <div className="confirm-actions">
                <button className="confirm-btn cancel" onClick={() => setConfirmClose(null)}>Cancel</button>
                <button
                  className="confirm-btn confirm"
                  onClick={() => handleClosePosition(confirmClose)}
                  disabled={closingId === confirmClose.id}
                  style={{ background: '#dc2626' }}
                >
                  {closingId === confirmClose.id ? 'Closing...' : 'Close Position'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

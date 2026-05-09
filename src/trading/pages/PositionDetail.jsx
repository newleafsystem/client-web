import '../styles/ai-analysis-light.css';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowLeft, Bookmark, Copy, Share2, Brain, TrendingUp, Clock, Shield, AlertTriangle, Calendar, Zap, CheckCircle, Lightbulb } from 'lucide-react';
import { usePortfolio } from '../hooks/usePortfolio';
import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { formatStrategy } from '../utils/formatters';
import { calculateMetrics, getUnderlyingPrice } from '../utils/optionsCalc';
import { getStrategyTheme, getThemeClass } from '../utils/strategyThemes';
import { PnLChart } from '../components/PnLChart';
import { StrategyHero } from '../components/ui';
import { usePriceContext } from '../contexts/PriceContext';
import { usePositionLiveData } from '../hooks/usePositionLiveData';
import WhyThisStrategyCard from '../components/analysis/WhyThisStrategyCard';
import LiveTradeExampleCard from '../components/analysis/LiveTradeExampleCard';
import ProfitLossMetricsCard from '../components/analysis/ProfitLossMetricsCard';
import PayoffDiagramCard from '../components/analysis/PayoffDiagramCard';
import StrategyRisksCard from '../components/analysis/StrategyRisksCard';
import EnhancedStrategyHeader from '../components/analysis/EnhancedStrategyHeader';
import ModeToggle from '../components/analysis/ModeToggle';
import PositionMonitor from '../components/analysis/PositionMonitor';
import LiveLegsTable from '../components/analysis/LiveLegsTable';
import '../styles/newleaf-system.css';

const COMPANY_NAMES = {
  AMZN: 'Amazon', AAPL: 'Apple', SPY: 'S&P 500 ETF', MSFT: 'Microsoft',
  NVDA: 'Nvidia', GOOGL: 'Alphabet', GOOG: 'Alphabet', META: 'Meta',
  TSLA: 'Tesla', NFLX: 'Netflix', QQQ: 'Nasdaq 100', IWM: 'Russell 2000',
  AMD: 'AMD', DIS: 'Disney', JPM: 'JPMorgan', V: 'Visa', MA: 'Mastercard',
  BA: 'Boeing', COST: 'Costco', CRM: 'Salesforce', AVGO: 'Broadcom',
  BABA: 'Alibaba', ADBE: 'Adobe', U: 'Unity', ORCL: 'Oracle',
};

export function PositionDetail({ tiles }) {
  const { tileId } = useParams();
  const navigate = useNavigate();
  const { portfolioItems, addToPortfolio, removeFromPortfolio, isInPortfolio } = usePortfolio();
  const { subscribe, unsubscribe, getPrice } = usePriceContext();

  // Tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Analysis data from Firestore
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  const tile = tiles.find(t => t.id === tileId);

  // Live P&L data (only when in portfolio)
  const portfolioItem = portfolioItems.find(p => p.tileId === tileId);
  const liveData = usePositionLiveData(tile, portfolioItem);

  // Subscribe to price updates for the underlying symbol
  useEffect(() => {
    if (tile?.symbol) {
      subscribe(tile.symbol);
      return () => unsubscribe(tile.symbol);
    }
  }, [tile?.symbol, subscribe, unsubscribe]);

  // Fetch analysis data
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!tileId) {
        setAnalysisLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'analyses', tileId);
        const docSnap = await getDoc(docRef);

        console.log('[PositionDetail] Fetching analysis for tileId:', tileId);
        console.log('[PositionDetail] Analysis doc exists?', docSnap.exists());

        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[PositionDetail] Analysis data keys:', Object.keys(data));
          console.log('[PositionDetail] Has strategyRationale?', !!data.strategyRationale);
          console.log('[PositionDetail] Has technicalIndicators?', !!data.technicalIndicators);
          console.log('[PositionDetail] Full analysis data:', data);
          setAnalysis(data);
        } else {
          console.warn('[PositionDetail] No analysis document found for', tileId);
        }
      } catch (err) {
        console.error('Error fetching analysis:', err);
      } finally {
        setAnalysisLoading(false);
      }
    };

    fetchAnalysis();
  }, [tileId]);

  if (!tile) {
    return (
      <div className="detail-container">
        <div className="detail-error">
          <h2>Position Not Found</h2>
          <button onClick={() => navigate('/invest')} className="btn-primary">
            Back to Discover
          </button>
        </div>
      </div>
    );
  }

  const { lottery = {}, technical = {}, greeks = {}, symbol, strategy = '', daysToExpiry, priceChange, aiInsight, legs = [] } = tile;

  // Calculate metrics from legs data (single source of truth)
  const metrics = useMemo(() => {
    if (!tile || !tile.legs || tile.legs.length === 0) return { maxProfit: 0, maxLoss: 0, breakevens: [] };
    return calculateMetrics(tile);
  }, [tile]);

  const calculatedUnderlyingPrice = useMemo(() => getUnderlyingPrice(tile), [tile]);

  // Get live price from PriceContext
  const livePrice = tile?.symbol ? getPrice(tile.symbol) : null;

  // Use live price if available, otherwise fall back to tile data
  const underlyingPrice = livePrice?.price || tile.underlyingPrice || tile.currentPrice || tile.price || calculatedUnderlyingPrice;
  const maxWin = tile.maxProfit ?? lottery.maxWin ?? technical.maxProfit ?? metrics.maxProfit;
  const ticketCost = tile.maxLoss ?? lottery.ticketCost ?? technical.maxLoss ?? technical.margin ?? metrics.maxLoss;
  const probability = tile.oddsOfProfit || tile.probOfProfit || lottery.oddsOfProfit || technical.probOfProfit || technical.probability || 0;
  const roi = tile.returnOnCapital ?? technical.returnOnCapital ?? technical.roi ?? (ticketCost > 0 ? (maxWin / ticketCost * 100) : 0);
  const rewardRisk = tile.rewardRisk ?? lottery.rewardRisk ?? (ticketCost > 0 ? (maxWin / ticketCost) : 0);

  // Strategy theme colors
  const theme = getStrategyTheme(strategy);
  const themeClass = getThemeClass(strategy);

  // Generate simulated RSI history converging to current value
  const generateRSIHistory = (currentValue) => {
    const data = [];
    let val = currentValue - 8 + Math.random() * 5;
    for (let i = 30; i >= 0; i--) {
      val += (Math.random() - 0.48) * 4;
      val = Math.max(15, Math.min(85, val));
      if (i === 0) val = currentValue;
      data.push({ day: 30 - i, rsi: Math.round(val * 10) / 10 });
    }
    return data;
  };

  // Generate simulated price within Bollinger Bands
  const generateBBHistory = (upper, middle, lower) => {
    const data = [];
    const range = upper - lower;
    let price = middle;
    for (let i = 30; i >= 0; i--) {
      price += (Math.random() - 0.5) * range * 0.08;
      price = Math.max(lower - range * 0.05, Math.min(upper + range * 0.05, price));
      const bandShift = Math.sin(i * 0.3) * range * 0.04;
      data.push({
        day: 30 - i,
        price: Math.round(price * 100) / 100,
        upper: Math.round((upper + bandShift) * 100) / 100,
        middle: Math.round(middle * 100) / 100,
        lower: Math.round((lower - bandShift) * 100) / 100,
      });
    }
    return data;
  };

  // Memoized chart data
  const rsiHistoryData = useMemo(() => {
    return analysis?.technicalIndicators?.rsi
      ? generateRSIHistory(analysis.technicalIndicators.rsi.value)
      : [];
  }, [analysis?.technicalIndicators?.rsi?.value]);

  const bbHistoryData = useMemo(() => {
    return analysis?.technicalIndicators?.bollingerBands
      ? generateBBHistory(
          analysis.technicalIndicators.bollingerBands.upper,
          analysis.technicalIndicators.bollingerBands.middle,
          analysis.technicalIndicators.bollingerBands.lower
        )
      : [];
  }, [
    analysis?.technicalIndicators?.bollingerBands?.upper,
    analysis?.technicalIndicators?.bollingerBands?.middle,
    analysis?.technicalIndicators?.bollingerBands?.lower
  ]);

  // Generate simulated SMA history with crossover detection (fallback when no real history)
  const generateSMAHistoryFallback = (sma20, sma50, sma100, currentPrice, sym) => {
    const days = 90;
    const symName = sym || 'X';

    const isBullish = sma50 > sma100;
    const spread = Math.abs(sma50 - sma100);
    const avgPrice = (sma50 + sma100) / 2;
    const spreadPct = (spread / avgPrice) * 100;
    const symHash = symName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const symbolVariation = (symHash % 40) - 20;
    const baseDays = Math.round(spreadPct * 8);
    const estCrossoverDaysAgo = Math.min(Math.max(baseDays + symbolVariation, 8), 80);

    const points = [];
    for (let i = days; i >= 0; i--) {
      const dayFromNow = i;
      let d_s50, d_s100, d_s20, d_price;

      if (dayFromNow > estCrossoverDaysAgo) {
        const preCross = (dayFromNow - estCrossoverDaysAgo) / (days - estCrossoverDaysAgo);
        if (isBullish) {
          d_s100 = sma100 + spread * 0.3 * preCross;
          d_s50 = sma100 - spread * 0.5 * preCross;
        } else {
          d_s100 = sma100 - spread * 0.3 * preCross;
          d_s50 = sma100 + spread * 0.5 * preCross;
        }
      } else {
        const postPct = 1 - (dayFromNow / estCrossoverDaysAgo);
        d_s50 = sma100 + (sma50 - sma100) * postPct;
        d_s100 = sma100 + (Math.random() - 0.5) * spread * 0.05;
      }

      d_s20 = sma20 + (Math.random() - 0.5) * (sma20 - sma50) * 0.3 * (dayFromNow / days);
      if (dayFromNow === 0) { d_s20 = sma20; d_s50 = sma50; d_s100 = sma100; }

      const priceRange = Math.abs(sma20 - sma50) * 1.5;
      d_price = d_s20 + Math.sin(dayFromNow * 0.4) * priceRange * 0.3 + (Math.random() - 0.5) * priceRange * 0.4;
      if (dayFromNow === 0) d_price = currentPrice;

      points.push({
        day: days - dayFromNow,
        daysAgo: dayFromNow,
        price: Math.round(d_price * 100) / 100,
        sma20: Math.round((d_s20 || sma20) * 100) / 100,
        sma50: Math.round((d_s50 || sma50) * 100) / 100,
        sma100: Math.round((d_s100 || sma100) * 100) / 100,
      });
    }

    return { data: points, crossoverDaysAgo: estCrossoverDaysAgo, isBullish };
  };

  const smaHistoryResult = useMemo(() => {
    if (!analysis?.technicalIndicators?.movingAverages) return { data: [], crossoverDaysAgo: 0, isBullish: false };
    const ma = analysis.technicalIndicators.movingAverages;
    const price = underlyingPrice || ma.sma20;

    // Prefer real history from Firestore (populated by fetchSMAData)
    if (ma.history && ma.history.length > 0) {
      // Transform real history into chart format with day index
      const totalPoints = ma.history.length;
      const chartData = ma.history.map((h, idx) => ({
        day: idx,
        daysAgo: totalPoints - 1 - idx,
        date: h.date,
        price: h.price,
        sma20: h.sma20,
        sma50: h.sma50,
        sma100: h.sma100,
      }));
      return {
        data: chartData,
        crossoverDaysAgo: ma.crossoverDaysAgo || 0,
        isBullish: ma.isBullish ?? (ma.sma50 > ma.sma100),
        isRealData: true,
        totalDays: totalPoints,
      };
    }

    // Fallback: simulated history from current SMA values
    // Use sma100 if available, fall back to sma200 for legacy data
    const sma100 = ma.sma100 || ma.sma200 || price * 0.94;
    const result = generateSMAHistoryFallback(ma.sma20, ma.sma50, sma100, price, symbol);
    if (ma.crossoverDaysAgo != null) result.crossoverDaysAgo = ma.crossoverDaysAgo;
    if (ma.isBullish != null) result.isBullish = ma.isBullish;
    result.isRealData = false;
    return result;
  }, [
    analysis?.technicalIndicators?.movingAverages?.sma20,
    analysis?.technicalIndicators?.movingAverages?.sma50,
    analysis?.technicalIndicators?.movingAverages?.sma100,
    analysis?.technicalIndicators?.movingAverages?.sma200,
    analysis?.technicalIndicators?.movingAverages?.crossoverDaysAgo,
    analysis?.technicalIndicators?.movingAverages?.isBullish,
    analysis?.technicalIndicators?.movingAverages?.history,
    underlyingPrice,
    symbol
  ]);

  const handleTogglePortfolio = async () => {
    try {
      if (isInPortfolio(tile.id)) {
        await removeFromPortfolio(tile.id);
      } else {
        await addToPortfolio(tile);
      }
    } catch (err) {
      console.error('Error toggling portfolio:', err);
    }
  };

  const handleCopyOrder = () => {
    const orderText = `${strategy} on ${symbol}\n${legs.map(leg =>
      `${leg.action} ${leg.quantity} ${leg.strike} ${leg.type} @ ${leg.expiry}`
    ).join('\n')}`;
    navigator.clipboard.writeText(orderText);
  };

  const handleShare = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
  };

  // Format publishedAt (use createdAt from analysis or tile, or fallback to "now")
  const publishedAt = analysis?.createdAt || tile.createdAt || tile.publishedAt;

  // Calculate Reward:Risk for hero display
  // Handle special cases: negative values, zero values, complex strategies
  let rewardRiskValue = 0;
  let rewardRiskDisplay = '—';

  if (ticketCost > 0) {
    rewardRiskValue = maxWin / ticketCost;
    if (rewardRiskValue > 0) {
      rewardRiskDisplay = `${rewardRiskValue.toFixed(2)}×`;
    } else if (rewardRiskValue < 0) {
      // Complex strategies (diagonals, etc.) may have negative traditional R:R
      // This indicates the strategy makes money differently (time decay, volatility, etc.)
      rewardRiskDisplay = `${rewardRiskValue.toFixed(2)}×`;
    } else {
      rewardRiskDisplay = '0.00×';
    }
  } else if (maxWin > 0) {
    // Undefined risk (e.g., long options with unlimited upside)
    rewardRiskDisplay = '∞';
  }

  const formatCurrency = (value) => {
    if (!value || isNaN(value)) return '$0';
    return '$' + Math.round(value).toLocaleString();
  };

  // Daily theta decay (positive theta = earning per day for credit strategies)
  const dailyTheta = liveData.liveGreeks?.net?.theta ?? greeks.netTheta ?? 0;

  // Hero stats — add current P&L when in portfolio
  const heroStats = [
    { label: 'Reward:Risk', value: rewardRiskDisplay, primary: true, positive: true },
    { label: 'Max Profit', value: formatCurrency(maxWin), positive: true },
    { label: 'Max Loss', value: formatCurrency(ticketCost), negative: true },
    ...(isInPortfolio(tile.id) && liveData.pnlPerContract !== undefined ? [{
      label: 'Current P&L',
      value: `${liveData.pnlPerContract >= 0 ? '+' : '-'}${formatCurrency(Math.abs(liveData.pnlPerContract))}`,
      positive: liveData.pnlPerContract >= 0,
      negative: liveData.pnlPerContract < 0,
    }] : [{
      label: 'Probability', value: `${probability.toFixed(0)}%`,
    }]),
    { label: 'Daily Theta', value: `$${dailyTheta.toFixed(2)}`, positive: dailyTheta > 0, negative: dailyTheta < 0 },
  ];

  return (
    <div className={`detail-container ${themeClass}`} style={{
      background: '#F7F5F0',
      minHeight: '100vh',
      padding: '20px'
    }}>
      {/* Mode Toggle */}
      <ModeToggle />

      {/* Hero Section */}
      <StrategyHero
        symbol={symbol}
        companyName={COMPANY_NAMES[symbol]}
        strategy={formatStrategy(strategy)}
        dte={daysToExpiry}
        spotPrice={underlyingPrice}
        publishedAt={publishedAt}
        stats={heroStats}
        onBack={() => navigate('/invest/discover')}
      />

      {/* Tab Bar */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`detail-tab ${activeTab === 'why' ? 'active' : ''}`}
          onClick={() => setActiveTab('why')}
        >
          Why This Trade?
          {!analysisLoading && analysis && analysis.strategyRationale && (
            <span className="tab-badge-dot"></span>
          )}
        </button>
        <button
          className={`detail-tab ${activeTab === 'technical' ? 'active' : ''}`}
          onClick={() => setActiveTab('technical')}
        >
          Technical Analysis
        </button>
        <button
          className={`detail-tab ${activeTab === 'theta-risk' ? 'active' : ''}`}
          onClick={() => setActiveTab('theta-risk')}
        >
          Theta & Risk
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            {/* Enhanced Strategy Header */}
            <div className="detail-section">
              <EnhancedStrategyHeader tile={tile} analysis={analysis} />
            </div>

            {/* Position Monitor — live P&L with progress bar (only if in portfolio) */}
            {isInPortfolio(tile.id) && (
              <div className="detail-section">
                <PositionMonitor liveData={liveData} symbol={tile.symbol} />
              </div>
            )}

            {/* Why This Strategy? - AI Explanation */}
            <div className="detail-section">
              <WhyThisStrategyCard tile={tile} analysis={analysis} />
            </div>

            {/* Live Legs Table — entry vs current (shown when in portfolio) */}
            {isInPortfolio(tile.id) ? (
              <div className="detail-section">
                <LiveLegsTable tile={tile} liveData={liveData} />
              </div>
            ) : (
              <div className="detail-section">
                <LiveTradeExampleCard tile={tile} currentPrice={underlyingPrice} />
              </div>
            )}

            {/* Profit & Loss Summary */}
            <div className="detail-section">
              <ProfitLossMetricsCard
                maxProfit={maxWin}
                maxLoss={ticketCost}
                breakevens={metrics.breakevens}
                currentPrice={underlyingPrice}
                tile={tile}
              />
            </div>

            {/* Enhanced P&L Payoff Chart */}
            <div className="detail-section">
              <PayoffDiagramCard
                tile={tile}
                currentPrice={underlyingPrice}
                breakevens={metrics.breakevens}
                maxProfit={maxWin}
                maxLoss={ticketCost}
              />
            </div>

            {/* When Strategy Fails - Risk Warnings */}
            <div className="detail-section">
              <StrategyRisksCard tile={tile} analysis={analysis} />
            </div>

            {/* Strategy Legs (Moved down but still accessible) */}
            <div className="detail-section">
              <h2 className="section-title">Strategy Legs</h2>
              <div className="legs-visualizer">
                {legs.length > 0 ? (
                  legs.map((leg, idx) => (
                    <div key={idx} className="leg-card">
                      <div className={`leg-action ${leg.action === 'sell' ? 'sell-action' : 'buy-action'}`}>
                        {leg.action?.toUpperCase() || 'BUY'}
                      </div>
                      <div className="leg-quantity">
                        {leg.type === 'stock' ? `${leg.quantity || 100} shares` : '1 contract'}
                      </div>
                      <div className="leg-strike">${leg.strike}</div>
                      <div className="leg-type">{leg.type?.toUpperCase()}</div>
                      <div className="leg-expiry">{leg.expiry}</div>
                      {leg.premium && <div className="leg-premium">${leg.premium}</div>}
                    </div>
                  ))
                ) : (
                  <div className="legs-placeholder">
                    <div className="leg-card">
                      <div className="leg-action">BUY</div>
                      <div className="leg-type">CALL</div>
                      <div className="leg-note">Leg details not available</div>
                    </div>
                  </div>
                )}
              </div>
            </div>


            {/* Greeks Dashboard — live recalculated */}
            <div className="detail-section">
              <h2 className="section-title">Greeks {liveData.currentSpot > 0 ? <span style={{ fontSize: 11, fontWeight: 400, color: '#6b6b60' }}>(live at ${liveData.currentSpot.toFixed(2)})</span> : ''}</h2>
              <div className="greeks-grid">
                <div className="greek-card">
                  <div className="greek-label">Delta</div>
                  <div className="greek-value">{(liveData.liveGreeks?.net?.delta ?? greeks.netDelta ?? 0).toFixed(3)}</div>
                  <div className="greek-desc">Directional exposure</div>
                </div>
                <div className="greek-card">
                  <div className="greek-label">Theta</div>
                  <div className="greek-value">{(liveData.liveGreeks?.net?.theta ?? greeks.netTheta ?? 0).toFixed(3)}</div>
                  <div className="greek-desc">Daily time decay</div>
                </div>
                <div className="greek-card">
                  <div className="greek-label">Vega</div>
                  <div className="greek-value">{(liveData.liveGreeks?.net?.vega ?? greeks.netVega ?? 0).toFixed(3)}</div>
                  <div className="greek-desc">Volatility sensitivity</div>
                </div>
                <div className="greek-card">
                  <div className="greek-label">Gamma</div>
                  <div className="greek-value">{(liveData.liveGreeks?.net?.gamma ?? greeks.netGamma ?? 0).toFixed(3)}</div>
                  <div className="greek-desc">Delta acceleration</div>
                </div>
              </div>
            </div>

            {/* Risk Scenarios — recalculated at current price */}
            <div className="detail-section">
              <h2 className="section-title">Risk Scenarios {liveData.currentSpot > 0 ? <span style={{ fontSize: 11, fontWeight: 400, color: '#6b6b60' }}>(from current ${liveData.currentSpot.toFixed(2)})</span> : ''}</h2>
              <div className="scenarios-grid">
                {(liveData.riskScenarios.length > 0 ? liveData.riskScenarios : [
                  { label: 'Bullish Move', pct: '+10%', pnl: (maxWin * 0.7) - ticketCost, desc: `If ${symbol} rises 10%` },
                  { label: 'No Move', pct: '0%', pnl: maxWin - ticketCost, desc: `If ${symbol} stays flat` },
                  { label: 'Bearish Move', pct: '-10%', pnl: -ticketCost, desc: `If ${symbol} falls 10%` },
                ]).map((s, i) => (
                  <div key={i} className={`scenario-card ${i === 0 ? 'bullish' : i === 1 ? 'neutral' : 'bearish'}`}>
                    <div className="scenario-header">
                      <div className="scenario-label">{s.label}</div>
                      <div className="scenario-move">{s.pct}</div>
                    </div>
                    <div className={`scenario-pnl ${s.pnl > 0 ? 'profit' : s.pnl < 0 ? 'loss' : ''}`}>
                      {s.pnl >= 0 ? '' : '-'}${Math.abs(s.pnl).toFixed(0)}
                    </div>
                    <div className="scenario-note">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis */}
            {aiInsight && (
              <div className="detail-section">
                <h2 className="section-title">AI Analysis</h2>
                <div className="ai-analysis-card" style={{ borderLeftColor: theme.primary }}>
                  <p className="ai-text">{aiInsight}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 2: WHY THIS TRADE? */}
        {activeTab === 'why' && (
          <>
            {!analysisLoading && analysis && analysis.strategyRationale ? (
              <div className="detail-section">
                <div className="analysis-section-header">
                  <Brain size={24} />
                  <h2>Strategy Rationale</h2>
                </div>

                <div>
                  <div className="rationale-block">
                    <h3>Why {strategy}?</h3>
                    <p>{analysis.strategyRationale.whyThisStrategy}</p>
                  </div>

                  <div className="rationale-block">
                    <h3>Why These Strikes?</h3>
                    <p>{analysis.strategyRationale.whyTheseStrikes}</p>
                  </div>

                  <div className="rationale-block">
                    <h3>Why This Expiry?</h3>
                    <p>{analysis.strategyRationale.whyThisExpiry}</p>
                  </div>

                  {analysis.strategyRationale.alternativesConsidered?.length > 0 && (
                    <div className="alternatives-list">
                      <h3 style={{ fontSize: '0.82em', fontWeight: 700, color: 'var(--gray-700)', marginBottom: '12px' }}>
                        Alternatives Considered
                      </h3>
                      {analysis.strategyRationale.alternativesConsidered.map((alt, idx) => (
                        <div key={idx} className="alternative-item">
                          <span className="alt-x">✗</span>
                          <span className="alt-name">{alt.strategy}</span>
                          <span className="alt-reason">— {alt.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-analysis">
                Deep analysis not yet available for this position. Analysis is generated during market scans.
              </div>
            )}
          </>
        )}

        {/* TAB 3: TECHNICAL ANALYSIS */}
        {activeTab === 'technical' && (
          <>
            {!analysisLoading && analysis && analysis.technicalIndicators ? (
              <div className="detail-section">
                <div className="analysis-section-header">
                  <TrendingUp size={24} />
                  <h2>Technical Indicators</h2>
                </div>

                {/* Indicator Cards */}
                <div className="indicator-grid">
                  {/* RSI Card */}
                  {analysis.technicalIndicators.rsi && (
                    <div className="indicator-card">
                      <div className="indicator-card-header">
                        <div className="indicator-name">RSI</div>
                        <div className={`signal-pill signal-${analysis.technicalIndicators.rsi.signal}`}>
                          {analysis.technicalIndicators.rsi.signal.replace('_', ' ')}
                        </div>
                      </div>
                      <div className="indicator-value">{analysis.technicalIndicators.rsi.value.toFixed(1)}</div>

                      {/* RSI Gauge */}
                      <div className="rsi-gauge">
                        <div className="rsi-marker" style={{ left: `${analysis.technicalIndicators.rsi.value}%` }}></div>
                      </div>
                      <div className="rsi-labels">
                        <span style={{ fontSize: '0.7em' }}>0 (Oversold)</span>
                        <span style={{ fontSize: '0.7em' }}>50</span>
                        <span style={{ fontSize: '0.7em' }}>100 (Overbought)</span>
                      </div>

                      {/* RSI Line Chart */}
                      {rsiHistoryData.length > 0 && (
                        <div style={{ marginTop: '16px', height: '150px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={rsiHistoryData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                style={{ fontSize: '0.7rem' }}
                                label={{ value: 'Days', position: 'insideBottom', offset: -5, style: { fontSize: '0.7rem' } }}
                              />
                              <YAxis
                                domain={[0, 100]}
                                stroke="#94a3b8"
                                style={{ fontSize: '0.7rem' }}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: '#ffffff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '0.5rem',
                                  fontSize: '0.75rem'
                                }}
                              />
                              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '70', position: 'right', fill: '#ef4444', fontSize: '0.7rem' }} />
                              <ReferenceLine y={30} stroke="#0B2D23" strokeDasharray="3 3" label={{ value: '30', position: 'right', fill: '#0B2D23', fontSize: '0.7rem' }} />
                              <Line
                                type="monotone"
                                dataKey="rsi"
                                stroke="#1e293b"
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="indicator-desc">{analysis.technicalIndicators.rsi.description}</div>
                    </div>
                  )}

                  {/* Bollinger Bands Card */}
                  {analysis.technicalIndicators.bollingerBands && (
                    <div className="indicator-card">
                      <div className="indicator-card-header">
                        <div className="indicator-name">Bollinger Bands</div>
                        <div className={`signal-pill signal-${analysis.technicalIndicators.bollingerBands.signal}`}>
                          {analysis.technicalIndicators.bollingerBands.signal.replace('_', ' ')}
                        </div>
                      </div>
                      <div className="indicator-sub-values">
                        <div className="indicator-sub">Upper: <span>{analysis.technicalIndicators.bollingerBands.upper.toFixed(2)}</span></div>
                        <div className="indicator-sub">Middle: <span>{analysis.technicalIndicators.bollingerBands.middle.toFixed(2)}</span></div>
                        <div className="indicator-sub">Lower: <span>{analysis.technicalIndicators.bollingerBands.lower.toFixed(2)}</span></div>
                        <div className="indicator-sub">Width: <span>{analysis.technicalIndicators.bollingerBands.width.toFixed(1)}%</span></div>
                      </div>

                      {/* Bollinger Bands Price Chart */}
                      {bbHistoryData.length > 0 && (
                        <div style={{ marginTop: '16px', height: '200px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={bbHistoryData}>
                              <defs>
                                <linearGradient id="bbFill" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#0B2D23" stopOpacity={0.06}/>
                                  <stop offset="95%" stopColor="#0B2D23" stopOpacity={0.06}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                style={{ fontSize: '0.7rem' }}
                              />
                              <YAxis
                                stroke="#94a3b8"
                                style={{ fontSize: '0.7rem' }}
                                domain={['auto', 'auto']}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: '#ffffff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '0.5rem',
                                  fontSize: '0.75rem'
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="upper"
                                stroke="none"
                                fill="url(#bbFill)"
                                fillOpacity={1}
                              />
                              <Area
                                type="monotone"
                                dataKey="lower"
                                stroke="none"
                                fill="#ffffff"
                                fillOpacity={1}
                              />
                              <Line
                                type="monotone"
                                dataKey="upper"
                                stroke="#94a3b8"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="middle"
                                stroke="#64748b"
                                strokeWidth={1}
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="lower"
                                stroke="#94a3b8"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="price"
                                stroke="#0B2D23"
                                strokeWidth={2}
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '8px', fontSize: '0.65em', color: '#64748b' }}>
                            <span><span style={{ color: '#0B2D23', fontSize: '1.4em' }}>●</span> Price</span>
                            <span><span style={{ color: '#94a3b8' }}>—</span> Upper Band</span>
                            <span><span style={{ color: '#64748b' }}>—</span> Middle Band</span>
                            <span><span style={{ color: '#94a3b8' }}>- -</span> Lower Band</span>
                          </div>
                        </div>
                      )}

                      <div className="indicator-desc">{analysis.technicalIndicators.bollingerBands.description}</div>
                    </div>
                  )}

                  {/* MACD Card */}
                  {analysis.technicalIndicators.macd && (
                    <div className="indicator-card">
                      <div className="indicator-card-header">
                        <div className="indicator-name">MACD</div>
                        <div className={`signal-pill signal-${analysis.technicalIndicators.macd.signal}`}>
                          {analysis.technicalIndicators.macd.signal.replace('_', ' ')}
                        </div>
                      </div>
                      <div className="indicator-sub-values">
                        <div className="indicator-sub">MACD: <span>{analysis.technicalIndicators.macd.macdLine.toFixed(2)}</span></div>
                        <div className="indicator-sub">Signal: <span>{analysis.technicalIndicators.macd.signalLine.toFixed(2)}</span></div>
                        <div className="indicator-sub">Histogram: <span>{analysis.technicalIndicators.macd.histogram.toFixed(2)}</span></div>
                      </div>
                      <div className="indicator-desc">{analysis.technicalIndicators.macd.description}</div>
                    </div>
                  )}

                  {/* Moving Averages Card — Enhanced with SMA Crossover Chart */}
                  {analysis.technicalIndicators.movingAverages && (
                    <div className="indicator-card" style={{ gridColumn: 'span 2' }}>
                      <div className="indicator-card-header">
                        <div className="indicator-name">Moving Averages</div>
                        <div className={`signal-pill signal-${analysis.technicalIndicators.movingAverages.signal}`}>
                          {analysis.technicalIndicators.movingAverages.signal.replace('_', ' ')}
                        </div>
                      </div>

                      {/* SMA Values Row */}
                      <div className="indicator-sub-values">
                        <div className="indicator-sub">SMA 20: <span style={{ color: '#f59e0b' }}>${analysis.technicalIndicators.movingAverages.sma20.toFixed(2)}</span></div>
                        <div className="indicator-sub">SMA 50: <span style={{ color: '#3b82f6' }}>${analysis.technicalIndicators.movingAverages.sma50.toFixed(2)}</span></div>
                        <div className="indicator-sub">SMA 100: <span style={{ color: '#ef4444' }}>${(analysis.technicalIndicators.movingAverages.sma100 || analysis.technicalIndicators.movingAverages.sma200 || 0).toFixed(2)}</span></div>
                        {smaHistoryResult.isRealData && (
                          <div className="indicator-sub" style={{ color: '#0B2D23', fontWeight: 600, fontSize: '0.75em' }}>● Live IB Data</div>
                        )}
                      </div>

                      {/* Crossover Badge */}
                      {smaHistoryResult.data.length > 0 && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0',
                          padding: '8px 12px', borderRadius: '8px',
                          background: smaHistoryResult.isBullish ? '#f0fdf4' : '#fef2f2',
                          border: `1px solid ${smaHistoryResult.isBullish ? '#bbf7d0' : '#fecaca'}`,
                        }}>
                          <span style={{ fontSize: '1.2em' }}>{smaHistoryResult.isBullish ? '🟢' : '🔴'}</span>
                          <div>
                            <div style={{
                              fontSize: '0.82em', fontWeight: 700,
                              color: smaHistoryResult.isBullish ? '#166534' : '#991b1b',
                            }}>
                              {smaHistoryResult.isBullish ? 'Golden Cross' : 'Death Cross'}
                              <span style={{
                                fontWeight: 400, fontSize: '0.9em', marginLeft: '6px',
                                color: smaHistoryResult.isBullish ? '#15803d' : '#b91c1c',
                              }}>
                                (SMA 50 {smaHistoryResult.isBullish ? 'above' : 'below'} SMA 100)
                              </span>
                            </div>
                            <div style={{
                              fontSize: '0.75em', marginTop: '2px',
                              color: smaHistoryResult.isBullish ? '#15803d' : '#b91c1c',
                            }}>
                              ~{smaHistoryResult.crossoverDaysAgo} trading days in {smaHistoryResult.isBullish ? 'bullish' : 'bearish'} trend
                              {' · '}Spread: ${Math.abs(analysis.technicalIndicators.movingAverages.sma50 - (analysis.technicalIndicators.movingAverages.sma100 || analysis.technicalIndicators.movingAverages.sma200 || 0)).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SMA Chart */}
                      {smaHistoryResult.data.length > 0 && (
                        <div style={{ marginTop: '8px', height: '240px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={smaHistoryResult.data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                style={{ fontSize: '0.7rem' }}
                                tickFormatter={(d) => {
                                  const totalDays = smaHistoryResult.totalDays || 91;
                                  const daysAgo = (totalDays - 1) - d;
                                  if (daysAgo === 0) return 'Today';
                                  // Show real dates if available
                                  if (smaHistoryResult.isRealData && smaHistoryResult.data[d]?.date) {
                                    const interval = Math.max(1, Math.floor(totalDays / 6));
                                    if (d % interval === 0 || d === smaHistoryResult.data.length - 1) {
                                      return smaHistoryResult.data[d].date.slice(5); // MM-DD
                                    }
                                    return '';
                                  }
                                  if (daysAgo % 15 === 0) return `-${daysAgo}d`;
                                  return '';
                                }}
                              />
                              <YAxis
                                stroke="#94a3b8"
                                style={{ fontSize: '0.7rem' }}
                                domain={['auto', 'auto']}
                                tickFormatter={(v) => `${v.toFixed(0)}`}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: '#ffffff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '0.5rem',
                                  fontSize: '0.75rem'
                                }}
                                formatter={(value, name) => [
                                  `${value.toFixed(2)}`,
                                  name === 'price' ? 'Price' : name === 'sma20' ? 'SMA 20' : name === 'sma50' ? 'SMA 50' : 'SMA 100'
                                ]}
                                labelFormatter={(d) => {
                                  if (smaHistoryResult.isRealData && smaHistoryResult.data[d]?.date) {
                                    return smaHistoryResult.data[d].date;
                                  }
                                  const daysAgo = 90 - d;
                                  return daysAgo === 0 ? 'Today' : `${daysAgo} days ago`;
                                }}
                              />
                              {/* Crossover reference line */}
                              <ReferenceLine
                                x={(smaHistoryResult.totalDays || 91) - 1 - smaHistoryResult.crossoverDaysAgo}
                                stroke={smaHistoryResult.isBullish ? '#0B2D23' : '#ef4444'}
                                strokeDasharray="4 4"
                                strokeWidth={2}
                                label={{
                                  value: smaHistoryResult.isBullish ? '✦ Golden Cross' : '✦ Death Cross',
                                  position: 'top',
                                  fill: smaHistoryResult.isBullish ? '#0B2D23' : '#dc2626',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                }}
                              />
                              <Line type="monotone" dataKey="price" stroke="#1e293b" strokeWidth={1.5} dot={false} />
                              <Line type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                              <Line type="monotone" dataKey="sma50" stroke="#3b82f6" strokeWidth={2} dot={false} />
                              <Line type="monotone" dataKey="sma100" stroke="#ef4444" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>

                          {/* Legend */}
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px', fontSize: '0.65em', color: '#64748b' }}>
                            <span><span style={{ color: '#1e293b', fontWeight: 700 }}>—</span> Price</span>
                            <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>—</span> SMA 20</span>
                            <span><span style={{ color: '#3b82f6', fontWeight: 700 }}>—</span> SMA 50</span>
                            <span><span style={{ color: '#ef4444', fontWeight: 700 }}>—</span> SMA 100</span>
                            <span><span style={{ color: smaHistoryResult.isBullish ? '#0B2D23' : '#ef4444' }}>┆</span> Crossover</span>
                          </div>
                        </div>
                      )}

                      <div className="indicator-desc" style={{ marginTop: '12px' }}>{analysis.technicalIndicators.movingAverages.description}</div>
                    </div>
                  )}

                  {/* Implied Volatility Card */}
                  {analysis.technicalIndicators.impliedVolatility && (
                    <div className="indicator-card">
                      <div className="indicator-card-header">
                        <div className="indicator-name">Implied Volatility</div>
                        <div className={`signal-pill signal-${analysis.technicalIndicators.impliedVolatility.currentIV > 60 ? 'bearish' : analysis.technicalIndicators.impliedVolatility.currentIV < 30 ? 'bullish' : 'neutral'}`}>
                          {analysis.technicalIndicators.impliedVolatility.currentIV > 60 ? 'High' : analysis.technicalIndicators.impliedVolatility.currentIV < 30 ? 'Low' : 'Normal'}
                        </div>
                      </div>
                      <div className="indicator-value">{analysis.technicalIndicators.impliedVolatility.currentIV.toFixed(1)}%</div>

                      {/* IV Rank Progress Bar */}
                      <div style={{ margin: '12px 0' }}>
                        <div style={{ width: '100%', height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            borderRadius: 4,
                            width: `${analysis.technicalIndicators.impliedVolatility.ivRank}%`,
                            background: analysis.technicalIndicators.impliedVolatility.ivRank < 30 ? '#0B2D23' : analysis.technicalIndicators.impliedVolatility.ivRank < 60 ? '#eab308' : '#ef4444',
                            transition: 'width 0.5s'
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6em', color: '#94a3b8', marginTop: 4 }}>
                          <span>Low (Cheap Options)</span>
                          <span>High (Expensive Options)</span>
                        </div>
                      </div>

                      <div className="indicator-sub-values">
                        <div className="indicator-sub">IV Rank: <span>{analysis.technicalIndicators.impliedVolatility.ivRank}</span></div>
                        <div className="indicator-sub">IV %ile: <span>{analysis.technicalIndicators.impliedVolatility.ivPercentile}</span></div>
                        <div className="indicator-sub">HV 30d: <span>{analysis.technicalIndicators.impliedVolatility.historicalVol30.toFixed(1)}%</span></div>
                      </div>
                      <div className="indicator-desc">{analysis.technicalIndicators.impliedVolatility.description}</div>
                    </div>
                  )}
                </div>

                {/* Support & Resistance Table */}
                {analysis.technicalIndicators.supportResistance && (
                  <div style={{ marginTop: '24px' }}>
                    <h3 style={{ fontSize: '0.82em', fontWeight: 700, color: 'var(--gray-700)', marginBottom: '12px' }}>
                      Support & Resistance Levels
                    </h3>
                    <table className="sr-table">
                      <thead>
                        <tr>
                          <th>Level</th>
                          <th>Type</th>
                          <th>Strength</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.technicalIndicators.supportResistance.support?.map((s, idx) => (
                          <tr key={`sup-${idx}`} className="sr-row-support">
                            <td className="sr-level">${s.level.toFixed(2)}</td>
                            <td>Support</td>
                            <td><span className={`sr-strength strength-${s.strength}`}>{s.strength}</span></td>
                            <td style={{ fontSize: '0.75em', color: 'var(--gray-600)' }}>{s.description}</td>
                          </tr>
                        ))}
                        {analysis.technicalIndicators.supportResistance.resistance?.map((r, idx) => (
                          <tr key={`res-${idx}`} className="sr-row-resistance">
                            <td className="sr-level">${r.level.toFixed(2)}</td>
                            <td>Resistance</td>
                            <td><span className={`sr-strength strength-${r.strength}`}>{r.strength}</span></td>
                            <td style={{ fontSize: '0.75em', color: 'var(--gray-600)' }}>{r.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-analysis">
                Deep analysis not yet available for this position. Analysis is generated during market scans.
              </div>
            )}
          </>
        )}

        {/* TAB 4: THETA & RISK */}
        {activeTab === 'theta-risk' && (
          <>
            {!analysisLoading && (analysis?.thetaDecaySchedule || analysis?.riskAnalysis) ? (
              <>
                {/* Theta Decay Schedule */}
                {analysis.thetaDecaySchedule && (
                  <div className="detail-section">
                    <div className="analysis-section-header">
                      <Clock size={24} />
                      <h2>Theta Decay Schedule</h2>
                    </div>

                    {analysis.thetaDecaySchedule.description && (
                      <p style={{ fontSize: '0.85em', color: 'var(--gray-600)', marginBottom: '20px', lineHeight: 1.6 }}>
                        {analysis.thetaDecaySchedule.description}
                      </p>
                    )}

                    {/* Theta Decay Chart */}
                    {analysis.thetaDecaySchedule.dailyDecay && analysis.thetaDecaySchedule.dailyDecay.length > 0 && (
                      <div className="theta-chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[...analysis.thetaDecaySchedule.dailyDecay].reverse()}>
                            <defs>
                              <linearGradient id="thetaGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0B2D23" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#0B2D23" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="daysToExpiry"
                              reversed={true}
                              stroke="#6b7280"
                              style={{ fontSize: '0.75rem', fontFamily: 'IBM Plex Mono, monospace' }}
                              label={{ value: 'Days to Expiry', position: 'insideBottom', offset: -5, style: { fontSize: '0.75rem' } }}
                            />
                            <YAxis
                              stroke="#6b7280"
                              style={{ fontSize: '0.75rem', fontFamily: 'IBM Plex Mono, monospace' }}
                              label={{ value: 'Daily Theta ($)', angle: -90, position: 'insideLeft', style: { fontSize: '0.75rem' } }}
                            />
                            <Tooltip
                              contentStyle={{
                                background: '#ffffff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '0.5rem',
                                fontSize: '0.875rem'
                              }}
                              formatter={(value) => [`$${value.toFixed(2)}`, 'Daily Theta']}
                              labelFormatter={(label) => `${label} days left`}
                            />
                            <Area
                              type="monotone"
                              dataKey="dailyTheta"
                              stroke="#0B2D23"
                              strokeWidth={2}
                              fill="url(#thetaGradient)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Theta Income Table */}
                    {analysis.thetaDecaySchedule.dailyDecay && analysis.thetaDecaySchedule.dailyDecay.length > 0 && (
                      <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                        <table className="theta-table">
                          <thead>
                            <tr>
                              <th>Days Left</th>
                              <th>Daily Theta</th>
                              <th>Cumulative</th>
                              <th>% of Max Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.thetaDecaySchedule.dailyDecay.slice(0, 10).map((row, idx) => (
                              <tr key={idx}>
                                <td>{row.daysToExpiry}</td>
                                <td className={row.dailyTheta > 0 ? 'theta-positive' : 'theta-negative'}>
                                  ${row.dailyTheta.toFixed(2)}
                                </td>
                                <td className="theta-positive">${row.cumulativeTheta.toFixed(2)}</td>
                                <td>{maxWin > 0 ? ((row.cumulativeTheta / maxWin) * 100).toFixed(1) : 0}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {analysis.thetaDecaySchedule.dailyDecay.length > 10 && (
                          <p style={{ fontSize: '0.75em', color: 'var(--gray-400)', marginTop: '8px', textAlign: 'center' }}>
                            Showing first 10 days. Full schedule available in detailed report.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Early Close Recommendation */}
                    {analysis.thetaDecaySchedule.earlyCloseRecommendation && (
                      <div className="theta-tip">
                        <Lightbulb />
                        <div>{analysis.thetaDecaySchedule.earlyCloseRecommendation}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Risk Analysis */}
                {analysis.riskAnalysis && (
                  <div className="detail-section">
                    <div className="analysis-section-header">
                      <Shield size={24} />
                      <h2>Risk Analysis</h2>
                    </div>

                    <div className="risk-cards">
                      {/* Max Pain Scenario */}
                      {analysis.riskAnalysis.maxPainScenario && (
                        <div className="risk-card risk-danger">
                          <div className="risk-card-icon">
                            <AlertTriangle />
                          </div>
                          <div className="risk-card-content">
                            <h4>Max Pain Scenario</h4>
                            <p>{analysis.riskAnalysis.maxPainScenario}</p>
                          </div>
                        </div>
                      )}

                      {/* Earnings Risk */}
                      {analysis.riskAnalysis.earningsRisk && (
                        <div className={`risk-card ${analysis.riskAnalysis.earningsRisk.toLowerCase().includes('no earnings') ? 'risk-safe' : 'risk-warning'}`}>
                          <div className="risk-card-icon">
                            <Calendar />
                          </div>
                          <div className="risk-card-content">
                            <h4>Earnings Risk</h4>
                            <p>{analysis.riskAnalysis.earningsRisk}</p>
                          </div>
                        </div>
                      )}

                      {/* Dividend Risk */}
                      {analysis.riskAnalysis.dividendRisk && (
                        <div className="risk-card risk-neutral">
                          <div className="risk-card-icon">
                            <TrendingUp />
                          </div>
                          <div className="risk-card-content">
                            <h4>Dividend Risk</h4>
                            <p>{analysis.riskAnalysis.dividendRisk}</p>
                          </div>
                        </div>
                      )}

                      {/* Event Risk */}
                      {analysis.riskAnalysis.eventRisk && (
                        <div className="risk-card risk-warning">
                          <div className="risk-card-icon">
                            <Zap />
                          </div>
                          <div className="risk-card-content">
                            <h4>Event Risk</h4>
                            <p>{analysis.riskAnalysis.eventRisk}</p>
                          </div>
                        </div>
                      )}

                      {/* Management Plan */}
                      {analysis.riskAnalysis.managementPlan && (
                        <div className="risk-card risk-safe" style={{ borderWidth: '2px' }}>
                          <div className="risk-card-icon">
                            <CheckCircle />
                          </div>
                          <div className="risk-card-content">
                            <h4>Management Plan</h4>
                            <p>{analysis.riskAnalysis.managementPlan}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-analysis">
                Deep analysis not yet available for this position. Analysis is generated during market scans.
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Bar */}
      <div className="detail-actions">
        <button
          className={`action-btn ${isInPortfolio(tile.id) ? 'active' : ''}`}
          onClick={handleTogglePortfolio}
        >
          <Bookmark size={20} fill={isInPortfolio(tile.id) ? 'currentColor' : 'none'} />
          {isInPortfolio(tile.id) ? 'Saved to Portfolio' : 'Add to Portfolio'}
        </button>
        <button className="action-btn" onClick={handleCopyOrder}>
          <Copy size={20} />
          Copy Order
        </button>
        <button className="action-btn" onClick={handleShare}>
          <Share2 size={20} />
          Share
        </button>
      </div>
    </div>
  );
}


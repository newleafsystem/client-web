import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { usePositionState } from '../hooks/usePositionState';
import { usePortfolio } from '../hooks/usePortfolio';
import { useShortlist } from '../hooks/useShortlist';
import { useVerdict, VERDICT_CONFIG, VERDICT_STATES } from '../hooks/useVerdict';
import { usePositionLiveData } from '../hooks/usePositionLiveData';
import { usePriceContext } from '../contexts/PriceContext';
import { formatStrategy } from '../utils/formatters';
import { calculateMetrics, getUnderlyingPrice } from '../utils/optionsCalc';
import { getStrategyTheme } from '../utils/strategyThemes';
import { LivePriceLarge } from '../components/LivePrice';
import { PayoffChart } from '../components/PayoffChart';
import { PhaseHeader } from '../components/PhaseHeader';
import LiveLegsTable from '../components/analysis/LiveLegsTable';
import { AdjustTab } from '../components/AdjustTab';
import { SectionLoader } from '../../shared/components/LeafLoader';
import '../styles/newleaf-system.css';

const COMPANY_NAMES = {
  AMZN: 'Amazon', AAPL: 'Apple', SPY: 'S&P 500 ETF', MSFT: 'Microsoft',
  NVDA: 'Nvidia', GOOGL: 'Alphabet', GOOG: 'Alphabet', META: 'Meta',
  TSLA: 'Tesla', NFLX: 'Netflix', QQQ: 'Nasdaq 100', IWM: 'Russell 2000',
  AMD: 'AMD', DIS: 'Disney', JPM: 'JPMorgan', V: 'Visa', MA: 'Mastercard',
  BA: 'Boeing', COST: 'Costco', CRM: 'Salesforce', AVGO: 'Broadcom',
  BABA: 'Alibaba', ADBE: 'Adobe', U: 'Unity', ORCL: 'Oracle', HON: 'Honeywell',
};

const fmt = (v) => {
  if (!v || isNaN(v)) return '$0';
  return '$' + Math.round(v).toLocaleString();
};

/**
 * /trading/strategy/:id — Dual-mode strategy detail page (Decide phase).
 *
 * Evaluate mode (unowned): thesis-led, [Take this trade] CTA, Setup/Thesis/Chart/Risks tabs.
 * Manage mode (owned):     verdict-led, action CTA, Now/Position/Chart/Adjust/History tabs.
 *
 * Phase 4a: Evaluate mode complete. Manage mode skeleton only (Phase 4b).
 */
export function StrategyDetailPage({ tiles }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const positionState = usePositionState(id);
  const { portfolioItems, isInPortfolio } = usePortfolio();
  const { addToShortlist, isShortlisted } = useShortlist();
  const { subscribe, unsubscribe, getPrice } = usePriceContext();

  const [activeTab, setActiveTab] = useState(null); // null = default per mode
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  const tile = tiles?.find(t => t.id === id);
  const mode = positionState === 'owned' ? 'manage' : 'evaluate';

  // Portfolio item + live data (Manage mode)
  const portfolioItem = portfolioItems.find(p => p.tileId === id) || null;
  const liveData = usePositionLiveData(tile, portfolioItem);
  const verdict = useVerdict(id, tile, liveData);

  // Set default tab based on mode
  useEffect(() => {
    setActiveTab(mode === 'evaluate' ? 'setup' : 'now');
  }, [mode]);

  // Subscribe to live price
  useEffect(() => {
    if (tile?.symbol) {
      subscribe(tile.symbol);
      return () => unsubscribe(tile.symbol);
    }
  }, [tile?.symbol, subscribe, unsubscribe]);

  // Fetch analysis from Firestore
  useEffect(() => {
    if (!id) { setAnalysisLoading(false); return; }
    const fetchAnalysis = async () => {
      try {
        const snap = await getDoc(doc(db, 'analyses', id));
        if (snap.exists()) setAnalysis(snap.data());
      } catch (err) {
        console.error('Error fetching analysis:', err);
      } finally {
        setAnalysisLoading(false);
      }
    };
    fetchAnalysis();
  }, [id]);

  // ─── Not found ───
  if (!tile) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '80px 2rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400, color: '#0B2D23', marginBottom: 12 }}>
          Strategy not found
        </h2>
        <button onClick={() => navigate('/invest/discover')} style={btnPrimary}>
          Back to Discover
        </button>
      </div>
    );
  }

  // ─── Derived data ───
  const { lottery = {}, technical = {}, greeks = {}, symbol, strategy = '', legs = [] } = tile;
  const daysToExpiry = tile.daysToExpiry ?? (tile.expiry ? Math.max(0, Math.round((new Date(tile.expiry + 'T16:00:00') - new Date()) / 86400000)) : null);
  const metrics = calculateMetrics(tile);
  const livePrice = tile.symbol ? getPrice(tile.symbol) : null;
  const spotPrice = livePrice?.price || tile.underlyingPrice || tile.currentPrice || getUnderlyingPrice(tile);
  const maxProfit = tile.maxProfit ?? lottery.maxWin ?? technical.maxProfit ?? metrics.maxProfit;
  const maxLoss = tile.maxLoss ?? lottery.ticketCost ?? technical.maxLoss ?? metrics.maxLoss;
  const probability = tile.oddsOfProfit || tile.probOfProfit || lottery.oddsOfProfit || technical.probability || 0;
  const rewardRisk = maxLoss > 0 ? maxProfit / maxLoss : (maxProfit > 0 ? Infinity : 0);
  const rrDisplay = rewardRisk === Infinity ? '∞' : `${rewardRisk.toFixed(2)}×`;
  const theme = getStrategyTheme(strategy);
  const publishedAt = analysis?.createdAt || tile.createdAt || tile.publishedAt;
  const saved = isShortlisted(id);

  // Compute evaluate status pill from probability and R:R
  const evalStatus = probability >= 55 && rewardRisk >= 0.3 ? 'good'
    : probability >= 40 ? 'marginal' : 'avoid';
  const evalStatusCfg = {
    good:     { label: 'Good setup',  color: '#0B7A52', bg: 'rgba(11,122,82,0.10)', border: 'rgba(11,122,82,0.25)' },
    marginal: { label: 'Marginal',    color: '#B7791F', bg: 'rgba(183,121,31,0.10)', border: 'rgba(183,121,31,0.25)' },
    avoid:    { label: 'Avoid',       color: '#C94F4F', bg: 'rgba(201,79,79,0.10)',  border: 'rgba(201,79,79,0.25)' },
  }[evalStatus];

  // Net credit/debit from legs
  const netCredit = legs.reduce((sum, leg) => {
    const p = leg.premium || 0;
    return sum + (leg.action === 'sell' ? p : -p);
  }, 0);
  const isCredit = netCredit > 0;

  // Build thesis one-liner from analysis or tile data
  const thesisOneLiner = useMemo(() => {
    if (analysis?.strategyRationale?.whyThisStrategy) {
      // Take first sentence
      const full = analysis.strategyRationale.whyThisStrategy;
      const firstSentence = full.split(/\.\s/)[0];
      return firstSentence.endsWith('.') ? firstSentence : firstSentence + '.';
    }
    // Fallback: generate from data
    const dir = strategy.toLowerCase().includes('bull') ? 'bullish'
      : strategy.toLowerCase().includes('bear') ? 'bearish' : 'neutral';
    return `${formatStrategy(strategy)} on ${symbol} — ${dir} thesis targeting ${probability.toFixed(0)}% probability of profit.`;
  }, [analysis, strategy, symbol, probability]);

  // Format published date
  const formatDate = (ts) => {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // ─── EVALUATE MODE ───
  if (mode === 'evaluate') {
    const tabs = [
      { key: 'setup', label: 'Setup' },
      { key: 'thesis', label: 'Thesis', badge: !analysisLoading && analysis?.strategyRationale },
      { key: 'chart', label: 'Chart' },
      { key: 'risks', label: 'Risks' },
      ...((tile.sentiment || analysis?._sentiment) ? [{ key: 'sentiment', label: 'Sentiment', badge: true }] : []),
    ];

    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 0 60px' }}>
        <PhaseHeader
          currentPhase="decide"
          title={`${symbol} ${formatStrategy(strategy)}`}
          subtitle={thesisOneLiner}
          compact
        />
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => navigate('/invest/discover')} style={btnBack}>
            &larr; Discover
          </button>
          <span style={{ color: '#d1d5db' }}>/</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#6b7280' }}>{symbol}</span>
          <span style={{ color: '#d1d5db' }}>/</span>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>{formatStrategy(strategy)}</span>
        </div>

        {/* ─── Verdict Hero ─── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(11,45,35,0.96), rgba(11,45,35,0.88))',
          borderRadius: 22, padding: '28px 28px 24px', color: '#fff', marginBottom: 20,
          boxShadow: '0 10px 24px rgba(17,24,39,0.08)',
        }}>
          {/* Top row: pill + meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                background: evalStatusCfg.bg, color: evalStatusCfg.color,
                border: `1px solid ${evalStatusCfg.border}`,
              }}>
                {evalStatusCfg.label}
              </span>
              <span style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                letterSpacing: '.1em', textTransform: 'uppercase',
                background: `${theme.primary}30`, color: theme.light,
                border: `1px solid ${theme.primary}50`,
              }}>
                {formatStrategy(strategy)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
              <span>{daysToExpiry} DTE</span>
              {publishedAt && <span>&middot; Published {formatDate(publishedAt)}</span>}
            </div>
          </div>

          {/* Title + live price */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 400 }}>{symbol}</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                {COMPANY_NAMES[symbol] || ''}
              </span>
            </div>
          </div>

          {/* Spot price */}
          <div style={{ marginBottom: 16 }}>
            <LivePriceLarge symbol={symbol} />
          </div>

          {/* Thesis one-liner */}
          <p style={{
            fontFamily: "'Playfair Display', serif", fontSize: 17, fontStyle: 'italic',
            color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 20, maxWidth: '70ch',
          }}>
            {thesisOneLiner}
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate(`/invest/build?add=${id}`)} style={btnGold}>
              Take this trade
            </button>
            <button
              onClick={() => { if (!saved) addToShortlist(tile); }}
              style={btnGhost}
            >
              {saved ? '✓ Saved' : 'Save for later'}
            </button>
          </div>
        </div>

        {/* ─── Vitals Row ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <VitalTile label="Max Profit" value={fmt(maxProfit)} positive />
          <VitalTile label="Max Loss" value={fmt(maxLoss)} negative />
          <VitalTile label="Reward:Risk" value={rrDisplay} primary />
          <VitalTile label="Probability" value={`${probability.toFixed(0)}%`} />
        </div>

        {/* ─── Tab Bar ─── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(17,24,39,0.10)', marginBottom: 24 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: activeTab === tab.key ? 700 : 500,
                color: activeTab === tab.key ? '#0B2D23' : '#9ca3af',
                borderBottom: activeTab === tab.key ? '2px solid #0B2D23' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {tab.label}
              {tab.badge && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A96E' }} />}
            </button>
          ))}
        </div>

        {/* ─── Tab Content ─── */}
        {activeTab === 'setup' && <SetupTab tile={tile} legs={legs} netCredit={netCredit} isCredit={isCredit} metrics={metrics} spotPrice={spotPrice} />}
        {activeTab === 'thesis' && <ThesisTab analysis={analysis} analysisLoading={analysisLoading} strategy={strategy} />}
        {activeTab === 'chart' && <ChartTab tile={tile} spotPrice={spotPrice} maxProfit={maxProfit} maxLoss={maxLoss} metrics={metrics} strategy={strategy} />}
        {activeTab === 'risks' && <RisksTab analysis={analysis} analysisLoading={analysisLoading} tile={tile} />}
        {activeTab === 'sentiment' && <SentimentTab sentiment={tile.sentiment || analysis?._sentiment} analysis={analysis} />}
      </div>
    );
  }

  // ─── MANAGE MODE ───
  const verdictCfg = VERDICT_CONFIG[verdict.state];
  const isUrgent = verdict.state === VERDICT_STATES.EXIT || verdict.state === VERDICT_STATES.ACTION_NEEDED;

  // Manage-mode hero CTA config per brief §10.3
  const manageCta = {
    [VERDICT_STATES.ON_TRACK]: { label: null, secondary: 'View position' },
    [VERDICT_STATES.TAKE_PROFIT]: {
      label: `Close for +${fmt(Math.abs(liveData.pnlPerContract))}`,
      secondary: 'Let expire',
    },
    [VERDICT_STATES.MONITOR]: { label: 'Set alert', secondary: 'View position' },
    [VERDICT_STATES.ACTION_NEEDED]: {
      label: verdict.recommendedAction || 'Review adjustments',
      secondary: 'Hold & monitor',
    },
    [VERDICT_STATES.EXIT]: { label: 'Close now', secondary: 'Details' },
  }[verdict.state] || { label: null, secondary: 'View position' };

  // Hero message per verdict
  const heroMessage = {
    [VERDICT_STATES.ON_TRACK]: `Let it work — ${liveData.profitCapturePct}% toward target.`,
    [VERDICT_STATES.TAKE_PROFIT]: `Close for +${fmt(Math.abs(liveData.pnlPerContract))} or let expire worthless.`,
    [VERDICT_STATES.MONITOR]: verdict.reason,
    [VERDICT_STATES.ACTION_NEEDED]: verdict.recommendedAction || verdict.reason,
    [VERDICT_STATES.EXIT]: 'Close now — stop triggered.',
  }[verdict.state] || verdict.reason;

  // Max loss used as percentage
  const maxLossUsedPct = maxLoss > 0 && liveData.pnlPerContract < 0
    ? Math.round((Math.abs(liveData.pnlPerContract) / maxLoss) * 100)
    : 0;

  const manageTabs = [
    { key: 'now', label: 'Now' },
    { key: 'position', label: 'Position' },
    { key: 'chart', label: 'Chart' },
    { key: 'adjust', label: 'Adjust' },
    { key: 'history', label: 'History' },
    ...((tile.sentiment || analysis?._sentiment) ? [{ key: 'sentiment', label: 'Sentiment', badge: true }] : []),
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 0 60px' }}>
      <PhaseHeader
        currentPhase="defend"
        title={`${symbol} ${formatStrategy(strategy)}`}
        subtitle={verdict.reason}
        compact
      />
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => navigate('/invest/positions')} style={btnBack}>
          &larr; Positions
        </button>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#6b7280' }}>{symbol}</span>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#9ca3af' }}>{formatStrategy(strategy)}</span>
      </div>

      {/* ─── Verdict Hero ─── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(11,45,35,0.96), rgba(11,45,35,0.88))',
        borderRadius: 22, padding: '28px', color: '#fff', marginBottom: isUrgent ? 0 : 20,
        boxShadow: '0 10px 24px rgba(17,24,39,0.08)',
        borderBottomLeftRadius: isUrgent ? 0 : 22,
        borderBottomRightRadius: isUrgent ? 0 : 22,
      }}>
        {/* Top row: verdict pill + strategy + DTE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 999,
              fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              background: verdictCfg.bg, color: verdictCfg.color,
              border: `1px solid ${verdictCfg.border}`,
            }}>
              {verdictCfg.label}
            </span>
            <span style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              letterSpacing: '.1em', textTransform: 'uppercase',
              background: `${theme.primary}30`, color: theme.light,
              border: `1px solid ${theme.primary}50`,
            }}>
              {formatStrategy(strategy)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            <span>{liveData.dte ?? daysToExpiry} DTE</span>
            {portfolioItem?.entryDate && (
              <span>&middot; Entered {portfolioItem.entryDate}</span>
            )}
          </div>
        </div>

        {/* Ticker + P&L */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 400 }}>{symbol}</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
              {COMPANY_NAMES[symbol] || ''}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 700,
              color: liveData.pnlPerContract >= 0 ? 'rgba(162,242,208,0.95)' : 'rgba(255,182,182,0.95)',
            }}>
              {liveData.pnlPerContract >= 0 ? '+' : ''}{fmt(liveData.pnlPerContract)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              per contract &middot; {liveData.quantity} qty &middot; total {liveData.pnlPerContract >= 0 ? '+' : ''}{fmt(liveData.pnlTotal)}
            </div>
          </div>
        </div>

        {/* Spot price */}
        <div style={{ marginBottom: 16 }}>
          <LivePriceLarge symbol={symbol} />
        </div>

        {/* Hero message — actionable, per §10.3 */}
        <p style={{
          fontFamily: "'Playfair Display', serif", fontSize: 17, fontStyle: 'italic',
          color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 20, maxWidth: '70ch',
        }}>
          {heroMessage}
        </p>

        {/* Verdict-driven CTAs */}
        <div style={{ display: 'flex', gap: 10 }}>
          {manageCta.label && (
            <button style={{
              ...(isUrgent ? btnDanger : btnGold),
            }}>
              {manageCta.label}
            </button>
          )}
          {manageCta.secondary && (
            <button
              onClick={() => setActiveTab('position')}
              style={btnGhost}
            >
              {manageCta.secondary}
            </button>
          )}
        </div>
      </div>

      {/* ─── Exit Signal Strip ─── */}
      {isUrgent && (
        <div style={{
          background: verdict.state === VERDICT_STATES.EXIT ? 'rgba(201,79,79,0.12)' : 'rgba(234,88,12,0.10)',
          border: `1px solid ${verdict.state === VERDICT_STATES.EXIT ? 'rgba(201,79,79,0.25)' : 'rgba(234,88,12,0.20)'}`,
          borderTop: 'none',
          borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
          padding: '12px 28px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase',
            color: verdict.state === VERDICT_STATES.EXIT ? '#C94F4F' : '#ea580c',
          }}>
            {verdict.state === VERDICT_STATES.EXIT ? 'EXIT SIGNAL' : 'ACTION NEEDED'}
          </span>
          <span style={{ fontSize: 13, color: '#374151' }}>
            {verdict.reason}
          </span>
        </div>
      )}

      {/* ─── Vitals Row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <VitalTile
          label="Current P&L"
          value={`${liveData.pnlPerContract >= 0 ? '+' : ''}${fmt(liveData.pnlPerContract)}`}
          positive={liveData.pnlPerContract >= 0}
          negative={liveData.pnlPerContract < 0}
        />
        <VitalTile
          label="Max Loss Used"
          value={maxLossUsedPct > 0 ? `${maxLossUsedPct}%` : '0%'}
          negative={maxLossUsedPct > 50}
        />
        <VitalTile
          label="Time Left"
          value={`${liveData.dte ?? daysToExpiry}d`}
          negative={(liveData.dte ?? daysToExpiry) <= 21}
        />
        <VitalTile
          label="Probability"
          value={`${probability.toFixed(0)}%`}
        />
      </div>

      {/* ─── Tab Bar ─── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(17,24,39,0.10)', marginBottom: 24 }}>
        {manageTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? '#0B2D23' : '#9ca3af',
              borderBottom: activeTab === tab.key ? '2px solid #0B2D23' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      {activeTab === 'now' && (
        <NowTab
          liveData={liveData}
          portfolioItem={portfolioItem}
          tile={tile}
          verdict={verdict}
          symbol={symbol}
          strategy={strategy}
          greeks={greeks}
        />
      )}
      {activeTab === 'position' && (
        <PositionTab tile={tile} liveData={liveData} />
      )}
      {activeTab === 'chart' && (
        <ManageChartTab tile={tile} spotPrice={spotPrice} maxProfit={maxProfit} maxLoss={maxLoss} metrics={metrics} liveData={liveData} strategy={strategy} />
      )}
      {activeTab === 'adjust' && (
        <AdjustTab
          tile={tile}
          portfolioItem={portfolioItem}
          liveData={liveData}
          verdict={verdict}
        />
      )}
      {activeTab === 'history' && (
        <HistoryTab portfolioItem={portfolioItem} liveData={liveData} symbol={symbol} strategy={strategy} />
      )}
      {activeTab === 'sentiment' && <SentimentTab sentiment={tile.sentiment || analysis?._sentiment} analysis={analysis} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sentiment Tab Component
// ═══════════════════════════════════════════════════════════════

function SentimentTab({ sentiment, analysis }) {
  if (!sentiment) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
        No sentiment data available for this tile.
      </div>
    );
  }

  const sent = analysis?._sentiment || sentiment;
  const label = sent.label || 'neutral';
  const color = label === 'bullish' ? '#1D9E75' : label === 'bearish' ? '#E24B4A' : '#6b7280';
  const modPts = sent.modifier?.points ?? sentiment.modifier ?? 0;
  const flags = sent.modifier?.flags || sentiment.flags || [];

  return (
    <div style={{
      background: `${color}06`, border: `1px solid ${color}18`,
      borderRadius: 14, padding: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 36, fontWeight: 700, color }}>
          {sent.score}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              letterSpacing: '.06em', textTransform: 'uppercase',
              background: `${color}12`, color, border: `1px solid ${color}25`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
              {label}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              Confidence: {Math.round((sent.confidence || 0) * 100)}%
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            Updated {sent.updatedAt ? new Date(sent.updatedAt).toLocaleString() : 'N/A'} &middot;
            {sent.activeEngines > 1 || (sent.engines && Object.keys(sent.engines).length > 1)
              ? ` ${sent.activeEngines || Object.keys(sent.engines || {}).length} AI engines (${Object.keys(sent.engines || {}).join(', ')})`
              : ` Source: ${sent.source || 'Claude Web Search'}`
            }
            {modPts !== 0 && (
              <span style={{ color, fontWeight: 600, marginLeft: 8 }}>
                {modPts > 0 ? '+' : ''}{modPts} score {modPts > 0 ? 'boost' : 'adjustment'} applied
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      {sent.summary && (
        <div style={{
          fontSize: 14, color: '#374151', lineHeight: 1.7, marginBottom: 16,
          padding: '14px 18px', background: 'rgba(255,255,255,0.7)',
          borderRadius: 10, border: '1px solid rgba(17,24,39,0.06)',
        }}>
          {sent.summary}
        </div>
      )}

      {/* Key Drivers */}
      {sent.keyDrivers?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
            Key Drivers
          </div>
          {sent.keyDrivers.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6, fontSize: 13, color: '#374151' }}>
              <span style={{
                color: d.impact === 'positive' ? '#1D9E75' : d.impact === 'negative' ? '#E24B4A' : '#d97706',
                fontSize: 11, flexShrink: 0, marginTop: 2,
              }}>
                {d.impact === 'positive' ? '\u25B2' : d.impact === 'negative' ? '\u25BC' : '\u25CF'}
              </span>
              <span>{d.factor}</span>
              {d.source && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({d.source})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Social + Sector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {sent.socialSentiment && (
          <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(17,24,39,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>Social Sentiment</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{sent.socialSentiment}</div>
          </div>
        )}
        {sent.sectorContext && (
          <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(17,24,39,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>Sector Context</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{sent.sectorContext}</div>
          </div>
        )}
      </div>

      {/* Modifier explanation */}
      {modPts !== 0 && (
        <div style={{
          background: `${color}08`, borderRadius: 10, padding: '12px 16px',
          border: `1px solid ${color}18`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>{modPts > 0 ? '\u2713' : '\u26A0'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>
              Score {modPts > 0 ? 'Boost' : 'Adjustment'}: {modPts > 0 ? '+' : ''}{modPts} points
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#374151' }}>
            {sent.modifier?.reason || sentiment.modifier?.reason || `${label} sentiment modifier applied`}
          </div>
        </div>
      )}

      {/* Caution / suppress flags */}
      {flags.includes('caution') && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(217,119,6,0.06)', borderRadius: 8, border: '1px solid rgba(217,119,6,0.15)', fontSize: 12, color: '#7a4a07' }}>
          <strong>&#9888; Caution:</strong> Sentiment diverges from technical trend. This position should be monitored more closely.
        </div>
      )}
      {flags.includes('suppress') && (
        <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(226,75,74,0.06)', borderRadius: 10, border: '1px solid rgba(226,75,74,0.15)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#C94F4F', marginBottom: 6 }}>&#128683; Material Event Detected</div>
          {(sent.materialEvents || sentiment?.materialEvents || []).map((evt, i) => (
            <div key={i} style={{ fontSize: 12, color: '#7a2020', lineHeight: 1.6, display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#C94F4F', flexShrink: 0 }}>{'\u25CF'}</span>
              <span>{evt}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
            This tile has been flagged due to an imminent binary event. Exercise caution — options pricing may not fully reflect the risk.
          </div>
        </div>
      )}

      {/* Per-engine breakdown */}
      {sent.engines && Object.keys(sent.engines).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
            Engine Breakdown ({sent.activeEngines || Object.keys(sent.engines).length} sources)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Object.keys(sent.engines).length, 4)}, 1fr)`, gap: 10 }}>
            {Object.entries(sent.engines).map(([name, eng]) => {
              const eColor = name === 'claude' ? '#D97706' : name === 'grok' ? '#1DA1F2' : name === 'gemini' ? '#4285F4' : '#7C3AED';
              const eLabel = name === 'claude' ? 'Claude' : name === 'grok' ? 'Grok / X' : name === 'gemini' ? 'Gemini' : 'Reddit';
              const eIcon = name === 'claude' ? 'C' : name === 'grok' ? 'X' : name === 'gemini' ? 'G' : 'R';
              return (
                <div key={name} style={{ background: `${eColor}06`, borderRadius: 10, padding: '12px 14px', border: `1px solid ${eColor}15`, textAlign: 'center' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${eColor}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: eColor, marginBottom: 6 }}>{eIcon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0B2D23' }}>{eLabel}</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: eColor, margin: '4px 0' }}>{eng.score}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{Math.round((eng.weight || 0) * 100)}% weight</div>
                  {eng.summary && <div style={{ fontSize: 10, color: '#6b6b60', marginTop: 6, lineHeight: 1.4, textAlign: 'left' }}>{eng.summary.slice(0, 80)}...</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab Components — Evaluate Mode
// ═══════════════════════════════════════════════════════════════

function SetupTab({ tile, legs, netCredit, isCredit, metrics, spotPrice }) {
  const breakevens = metrics.breakevens || [];

  return (
    <div>
      {/* Legs table */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={sectionH3}>Position Legs</h3>
        <div style={{
          border: '1px solid rgba(17,24,39,0.10)', borderRadius: 16, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(247,248,250,0.75)' }}>
                {['Action', 'Type', 'Strike', 'Expiry', 'Premium', 'Delta'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {legs.map((leg, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(17,24,39,0.06)' }}>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      background: leg.action === 'sell' ? 'rgba(201,79,79,0.10)' : 'rgba(11,122,82,0.10)',
                      color: leg.action === 'sell' ? '#C94F4F' : '#0B7A52',
                    }}>
                      {leg.action}
                    </span>
                  </td>
                  <td style={tdStyle}>{(leg.type || '').toUpperCase()}</td>
                  <td style={{ ...tdStyle, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
                    ${leg.strike}
                  </td>
                  <td style={tdStyle}>{leg.expiry || '--'}</td>
                  <td style={{ ...tdStyle, fontFamily: "'Space Mono', monospace" }}>
                    {leg.premium ? `$${leg.premium.toFixed(2)}` : '--'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "'Space Mono', monospace" }}>
                    {leg.delta ? leg.delta.toFixed(2) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Net credit/debit + profit zone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{
          ...cardBase,
          background: isCredit ? 'rgba(11,122,82,0.06)' : 'rgba(201,79,79,0.06)',
          borderColor: isCredit ? 'rgba(11,122,82,0.15)' : 'rgba(201,79,79,0.15)',
        }}>
          <div style={metaLabel}>Net {isCredit ? 'Credit' : 'Debit'}</div>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700,
            color: isCredit ? '#0B7A52' : '#C94F4F',
          }}>
            ${Math.abs(netCredit * 100).toFixed(0)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            per contract ({isCredit ? 'received' : 'paid'})
          </div>
        </div>
        <div style={cardBase}>
          <div style={metaLabel}>Profit Zone</div>
          {breakevens.length > 0 ? (
            <>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: '#111827' }}>
                {breakevens.length === 2
                  ? `$${breakevens[0].toFixed(0)} – $${breakevens[1].toFixed(0)}`
                  : breakevens.length === 1
                    ? `Above $${breakevens[0].toFixed(0)}`
                    : '--'}
              </div>
              {spotPrice > 0 && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  Current: ${spotPrice.toFixed(2)}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 14, color: '#9ca3af' }}>Breakeven data not available</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThesisTab({ analysis, analysisLoading, strategy }) {
  if (analysisLoading) return <SectionLoader label="Loading analysis" minHeight={220} />;
  if (!analysis?.strategyRationale) return <div style={placeholder}>Deep analysis not yet available for this strategy. Analysis is generated during market scans.</div>;

  const { whyThisStrategy, whyTheseStrikes, whyThisExpiry, alternativesConsidered } = analysis.strategyRationale;
  const ti = analysis.technicalIndicators;

  return (
    <div>
      {/* Rationale blocks */}
      {[
        { title: `Why ${formatStrategy(strategy)}?`, text: whyThisStrategy },
        { title: 'Why these strikes?', text: whyTheseStrikes },
        { title: 'Why this expiry?', text: whyThisExpiry },
      ].filter(b => b.text).map((block, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <h3 style={sectionH3}>{block.title}</h3>
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{block.text}</p>
        </div>
      ))}

      {/* Alternatives considered */}
      {alternativesConsidered?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={sectionH3}>Alternatives Considered</h3>
          {alternativesConsidered.map((alt, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: '#C94F4F', fontWeight: 700 }}>✗</span>
              <span style={{ fontWeight: 600 }}>{alt.strategy}</span>
              <span style={{ color: '#6b7280' }}>— {alt.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Supporting technicals (summary) */}
      {ti && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionH3}>Technical Context</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {ti.rsi && (
              <TechTile
                label="RSI"
                value={ti.rsi.value.toFixed(1)}
                signal={ti.rsi.signal}
                desc={ti.rsi.description}
              />
            )}
            {ti.impliedVolatility && (
              <TechTile
                label="IV Rank"
                value={`${(ti.impliedVolatility.ivRank || 0).toFixed(0)}%`}
                desc={ti.impliedVolatility.description}
              />
            )}
            {ti.movingAverages && (
              <TechTile
                label="Trend"
                value={ti.movingAverages.signal?.replace('_', ' ') || 'N/A'}
                desc={ti.movingAverages.description}
              />
            )}
            {ti.bollingerBands && (
              <TechTile
                label="BB Width"
                value={ti.bollingerBands.width?.toFixed(2) || '--'}
                signal={ti.bollingerBands.signal}
                desc={ti.bollingerBands.description}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartTab({ tile, spotPrice, maxProfit, maxLoss, metrics, strategy }) {
  return (
    <div>
      <h3 style={sectionH3}>P&L at Expiration</h3>
      <div style={{
        ...cardBase, padding: 0, overflow: 'hidden', minHeight: 320,
      }}>
        <PayoffChart
              legs={tile.legs || []}
              spotPrice={spotPrice}
              height={280}
              accentColor={getStrategyTheme(strategy || tile.strategy).primary}
            />
      </div>

      {/* Quick metrics below chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
        <div style={cardBase}>
          <div style={metaLabel}>Max Profit</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B7A52' }}>{fmt(maxProfit)}</div>
        </div>
        <div style={cardBase}>
          <div style={metaLabel}>Max Loss</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#C94F4F' }}>{fmt(maxLoss)}</div>
        </div>
        <div style={cardBase}>
          <div style={metaLabel}>Breakevens</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: '#111827' }}>
            {(metrics.breakevens || []).map(b => `$${b.toFixed(0)}`).join(' / ') || '--'}
          </div>
        </div>
      </div>
    </div>
  );
}

function RisksTab({ analysis, analysisLoading, tile }) {
  if (analysisLoading) return <SectionLoader label="Loading risk analysis" minHeight={220} />;

  const risk = analysis?.riskAnalysis;
  const hasRisk = risk && (risk.maxPainScenario || risk.earningsRisk || risk.eventRisk || risk.managementPlan);

  return (
    <div>
      <h3 style={sectionH3}>What Could Go Wrong</h3>

      {hasRisk ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Max Pain Scenario', text: risk.maxPainScenario, icon: '⚠️' },
            { label: 'Earnings Risk', text: risk.earningsRisk, icon: '📅' },
            { label: 'Dividend Risk', text: risk.dividendRisk, icon: '💰' },
            { label: 'Event Risk', text: risk.eventRisk, icon: '🌐' },
          ].filter(r => r.text).map((item, i) => (
            <div key={i} style={{
              ...cardBase,
              borderLeft: '3px solid rgba(201,79,79,0.3)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#C94F4F', marginBottom: 4 }}>
                {item.icon} {item.label}
              </div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{item.text}</p>
            </div>
          ))}

          {risk.managementPlan && (
            <div style={{
              ...cardBase,
              borderLeft: '3px solid rgba(11,122,82,0.3)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0B7A52', marginBottom: 4 }}>
                🛡️ Management Plan
              </div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{risk.managementPlan}</p>
            </div>
          )}
        </div>
      ) : (
        <div style={placeholder}>
          Risk analysis not yet available for this strategy. Generated during market scans.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab Components — Manage Mode
// ═══════════════════════════════════════════════════════════════

function NowTab({ liveData, portfolioItem, tile, verdict, symbol, strategy, greeks }) {
  const entry = portfolioItem || {};
  const entrySpot = liveData.entrySpot || entry.entryUnderlyingPrice || 0;
  const currentSpot = liveData.currentSpot || 0;

  // Entry vs current comparison tiles
  const deltas = liveData.liveGreeks?.net || {};
  const entryDelta = greeks.netDelta || 0;
  const entryTheta = greeks.netTheta || 0;

  const showThesisBroken = verdict.state === VERDICT_STATES.MONITOR
    || verdict.state === VERDICT_STATES.ACTION_NEEDED
    || verdict.state === VERDICT_STATES.EXIT;

  return (
    <div>
      <h3 style={sectionH3}>What's Changed Since Entry</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <ChangeTile
          label="Spot Price"
          entry={entrySpot > 0 ? `$${entrySpot.toFixed(2)}` : '--'}
          current={currentSpot > 0 ? `$${currentSpot.toFixed(2)}` : '--'}
          pctChange={liveData.priceMove}
        />
        <ChangeTile
          label="Net Delta"
          entry={entryDelta.toFixed(3)}
          current={(deltas.delta || 0).toFixed(3)}
          pctChange={entryDelta !== 0 ? ((deltas.delta - entryDelta) / Math.abs(entryDelta)) * 100 : 0}
        />
        <ChangeTile
          label="Net Theta"
          entry={`$${entryTheta.toFixed(2)}`}
          current={`$${(deltas.theta || 0).toFixed(2)}`}
        />
        <ChangeTile
          label="P&L Progress"
          entry="Entry"
          current={`${liveData.profitCapturePct}%`}
          pctChange={liveData.profitCapturePct}
        />
      </div>

      {/* Progress bar */}
      <div style={{ ...cardBase, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...metaLabel, marginBottom: 0 }}>P&L Progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: liveData.pnlPerContract >= 0 ? '#0B7A52' : '#C94F4F' }}>
            {liveData.profitCapturePct}% of max profit
          </span>
        </div>
        <div style={{ height: 8, background: 'rgba(17,24,39,0.08)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 999, transition: 'width 0.3s ease',
            width: `${Math.max(0, Math.min(100, liveData.progressPct))}%`,
            background: liveData.pnlPerContract >= 0
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #ef4444, #f87171)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#9ca3af' }}>
          <span>Max loss ({fmt(liveData.maxLoss)})</span>
          <span>Max profit ({fmt(liveData.maxProfit)})</span>
        </div>
      </div>

      {/* "What broke the thesis" callout — only when Monitor/Action/Exit */}
      {showThesisBroken && (
        <div style={{
          ...cardBase,
          borderLeft: '3px solid rgba(201,79,79,0.4)',
          background: 'rgba(201,79,79,0.04)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#C94F4F', marginBottom: 6 }}>
            What Broke the Thesis
          </div>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
            {verdict.reason}
          </p>
        </div>
      )}
    </div>
  );
}

function PositionTab({ tile, liveData }) {
  return (
    <div>
      <h3 style={sectionH3}>Position Legs — Entry vs Current</h3>
      <LiveLegsTable tile={tile} liveData={liveData} />

      {/* Greeks summary */}
      {liveData.liveGreeks && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionH3}>
            Net Greeks
            {liveData.currentSpot > 0 && (
              <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                (live at ${liveData.currentSpot.toFixed(2)})
              </span>
            )}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Delta', value: (liveData.liveGreeks.net?.delta || 0).toFixed(3), desc: 'Directional exposure' },
              { label: 'Theta', value: `$${(liveData.liveGreeks.net?.theta || 0).toFixed(2)}`, desc: 'Daily time decay' },
              { label: 'Vega', value: (liveData.liveGreeks.net?.vega || 0).toFixed(3), desc: 'Volatility sensitivity' },
              { label: 'Gamma', value: (liveData.liveGreeks.net?.gamma || 0).toFixed(4), desc: 'Delta acceleration' },
            ].map((g, i) => (
              <div key={i} style={cardBase}>
                <div style={metaLabel}>{g.label}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
                  {g.value}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{g.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ManageChartTab({ tile, spotPrice, maxProfit, maxLoss, metrics, liveData, strategy }) {
  return (
    <div>
      <h3 style={sectionH3}>P&L at Expiration</h3>
      <div style={{ ...cardBase, padding: 0, overflow: 'hidden', minHeight: 320 }}>
        <PayoffChart
              legs={tile.legs || []}
              spotPrice={spotPrice}
              height={280}
              accentColor={getStrategyTheme(strategy || tile.strategy).primary}
            />
      </div>

      {/* Entry vs current price context */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        <div style={cardBase}>
          <div style={metaLabel}>Entry Price</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: '#111827' }}>
            ${liveData.entrySpot > 0 ? liveData.entrySpot.toFixed(2) : '--'}
          </div>
        </div>
        <div style={cardBase}>
          <div style={metaLabel}>Current Price</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: '#111827' }}>
            ${spotPrice > 0 ? spotPrice.toFixed(2) : '--'}
          </div>
        </div>
        <div style={cardBase}>
          <div style={metaLabel}>Price Move</div>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700,
            color: liveData.priceMove >= 0 ? '#0B7A52' : '#C94F4F',
          }}>
            {liveData.priceMove >= 0 ? '+' : ''}{liveData.priceMove.toFixed(1)}%
          </div>
        </div>
        <div style={cardBase}>
          <div style={metaLabel}>Breakevens</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: '#111827' }}>
            {(metrics.breakevens || []).map(b => `$${b.toFixed(0)}`).join(' / ') || '--'}
          </div>
        </div>
      </div>

      {/* Risk scenarios */}
      {liveData.riskScenarios.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionH3}>Risk Scenarios</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {liveData.riskScenarios.map((s, i) => (
              <div key={i} style={{
                ...cardBase,
                borderTop: `3px solid ${i === 0 ? '#0B7A52' : i === 1 ? '#9ca3af' : '#C94F4F'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ ...metaLabel, marginBottom: 0 }}>{s.label}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#6b7280' }}>{s.pct}</span>
                </div>
                <div style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700,
                  color: s.pnl >= 0 ? '#0B7A52' : '#C94F4F', marginBottom: 4,
                }}>
                  {s.pnl >= 0 ? '+' : ''}{fmt(s.pnl)}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ portfolioItem, liveData, symbol, strategy }) {
  const entry = portfolioItem || {};
  const entryDate = entry.entryDate || entry.addedAt?.toDate?.()?.toLocaleDateString('en-US') || '--';
  const entryCredit = Math.abs(entry.entryNetCredit || 0);

  return (
    <div>
      <h3 style={sectionH3}>Position Timeline</h3>

      {/* Entry event */}
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        {/* Timeline line */}
        <div style={{
          position: 'absolute', left: 7, top: 8, bottom: 0, width: 2,
          background: 'rgba(17,24,39,0.08)',
        }} />

        {/* Entry dot + card */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{
            position: 'absolute', left: -20, top: 6, width: 10, height: 10,
            borderRadius: '50%', background: '#0B7A52', border: '2px solid #fff',
            boxShadow: '0 0 0 2px rgba(11,122,82,0.2)',
          }} />
          <div style={cardBase}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ ...metaLabel, marginBottom: 0 }}>Position Opened</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{entryDate}</span>
            </div>
            <div style={{ fontSize: 14, color: '#111827', lineHeight: 1.6 }}>
              Entered {formatStrategy(strategy)} on {symbol} at ${liveData.entrySpot > 0 ? liveData.entrySpot.toFixed(2) : '--'}.
              {entryCredit > 0 && ` Net credit received: $${(entryCredit / 100).toFixed(2)}/share ($${entryCredit.toFixed(0)}/contract).`}
              {' '}Quantity: {entry.quantity || 1} contract{(entry.quantity || 1) !== 1 ? 's' : ''}.
            </div>
          </div>
        </div>

        {/* Current state dot + card */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -20, top: 6, width: 10, height: 10,
            borderRadius: '50%',
            background: liveData.pnlPerContract >= 0 ? '#0B7A52' : '#C94F4F',
            border: '2px solid #fff',
            boxShadow: `0 0 0 2px ${liveData.pnlPerContract >= 0 ? 'rgba(11,122,82,0.2)' : 'rgba(201,79,79,0.2)'}`,
          }} />
          <div style={cardBase}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ ...metaLabel, marginBottom: 0 }}>Current State</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {liveData.dte != null ? `${liveData.dte} days remaining` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 14, color: '#111827', lineHeight: 1.6 }}>
              Unrealized P&L: {liveData.pnlPerContract >= 0 ? '+' : ''}{fmt(liveData.pnlPerContract)}/contract.
              Spot at ${liveData.currentSpot > 0 ? liveData.currentSpot.toFixed(2) : '--'}
              {' '}({liveData.priceMove >= 0 ? '+' : ''}{liveData.priceMove.toFixed(1)}% from entry).
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...placeholder, paddingTop: 24 }}>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>
          Prior adjustments and P&L path chart will be populated when adjustment history is tracked (Phase 6).
        </p>
      </div>
    </div>
  );
}

// Helper for Now tab entry→current comparison
function ChangeTile({ label, entry, current, pctChange }) {
  return (
    <div style={cardBase}>
      <div style={metaLabel}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Entry</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#6b7280' }}>{entry}</div>
        </div>
        <div style={{ fontSize: 16, color: '#d1d5db' }}>&rarr;</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Now</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: '#111827' }}>{current}</div>
        </div>
      </div>
      {pctChange !== undefined && pctChange !== 0 && (
        <div style={{
          marginTop: 4, fontSize: 11, fontWeight: 600, textAlign: 'right',
          color: pctChange > 0 ? '#0B7A52' : '#C94F4F',
        }}>
          {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════

function VitalTile({ label, value, positive, negative, primary }) {
  let valueColor = '#111827';
  if (positive) valueColor = '#0B7A52';
  if (negative) valueColor = '#C94F4F';

  return (
    <div style={{
      ...cardBase,
      ...(primary ? {
        background: 'linear-gradient(135deg, rgba(11,45,35,0.08), rgba(201,169,110,0.08))',
        borderColor: 'rgba(11,45,35,0.18)',
      } : {}),
    }}>
      <div style={metaLabel}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.3px', color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

function TechTile({ label, value, signal, desc }) {
  const signalColor = {
    bullish: '#0B7A52', bearish: '#C94F4F', neutral: '#B7791F',
    overbought: '#C94F4F', oversold: '#0B7A52',
  }[signal] || '#6b7280';

  return (
    <div style={cardBase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={metaLabel}>{label}</span>
        {signal && (
          <span style={{ fontSize: 10, fontWeight: 700, color: signalColor, textTransform: 'capitalize' }}>
            {signal.replace('_', ' ')}
          </span>
        )}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{value}</div>
      {desc && <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>{desc}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared styles
// ═══════════════════════════════════════════════════════════════

const cardBase = {
  background: '#fff', border: '1px solid rgba(17,24,39,0.10)',
  borderRadius: 16, padding: 14,
};

const metaLabel = {
  fontSize: 10, fontWeight: 900, letterSpacing: '.14em',
  textTransform: 'uppercase', color: 'rgba(17,24,39,0.55)', marginBottom: 6,
};

const sectionH3 = {
  fontSize: 16, fontWeight: 900, letterSpacing: '-0.2px',
  color: '#111827', marginBottom: 12,
};

const thStyle = {
  padding: '10px 12px', fontSize: 10, fontWeight: 900,
  letterSpacing: '.12em', textTransform: 'uppercase',
  color: 'rgba(17,24,39,0.55)', textAlign: 'left',
  borderBottom: '1px solid rgba(17,24,39,0.08)',
};

const tdStyle = {
  padding: '10px 12px', fontSize: 13,
};

const placeholder = {
  padding: '40px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14,
};

const btnPrimary = {
  padding: '10px 20px', background: '#0B2D23', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
};

const btnGold = {
  padding: '12px 24px', background: '#C9A96E', color: '#0B2D23',
  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(201,169,110,0.28)',
};

const btnGhost = {
  padding: '12px 24px', background: 'rgba(255,255,255,0.10)',
  color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const btnDanger = {
  padding: '12px 24px', background: '#C94F4F', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(201,79,79,0.28)',
};

const btnBack = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: '#6b7280', padding: 0,
};

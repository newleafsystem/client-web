import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import { useShortlist } from '../hooks/useShortlist';
import { useMarketState } from '../hooks/useMarketState';
import { formatStrategy } from '../utils/formatters';
import { calculateMetrics } from '../utils/optionsCalc';
import { SegmentedTabs, StrategyCard } from '../components/ui';
import { PhaseHeader } from '../components/PhaseHeader';
import '../styles/newleaf-system.css';

const COMPANY_NAMES = {
  AMZN: 'Amazon', AAPL: 'Apple', SPY: 'S&P 500 ETF', MSFT: 'Microsoft',
  NVDA: 'Nvidia', GOOGL: 'Alphabet', GOOG: 'Alphabet', META: 'Meta',
  TSLA: 'Tesla', NFLX: 'Netflix', QQQ: 'Nasdaq 100', IWM: 'Russell 2000',
  AMD: 'AMD', DIS: 'Disney', JPM: 'JPMorgan', V: 'Visa', MA: 'Mastercard',
  BA: 'Boeing', COST: 'Costco', CRM: 'Salesforce', AVGO: 'Broadcom',
  BABA: 'Alibaba', ADBE: 'Adobe', U: 'Unity', ORCL: 'Oracle',
};

// Derive market conditions from tile data + optional VIX
function getMarketPulse(tiles, marketState) {
  const strategies = tiles.map(t => (t.strategy || '').toLowerCase().replace(/_/g, ' '));
  const hasCondors = strategies.some(s => s.includes('iron condor'));
  const hasCovered = strategies.some(s => s.includes('covered'));
  const hasSpreads = strategies.some(s => s.includes('spread'));
  const vix = marketState?.vix;
  const vixText = vix ? `VIX at ${vix.toFixed(1)} — ` : '';

  // Use VIX level if available
  if (vix && vix < 18) {
    return {
      headline: 'Low Volatility Environment',
      detail: `${vixText}Ideal conditions for iron condors and covered calls. Wide ranges, high probability of profit.`,
    };
  }
  if (vix && vix >= 18 && vix < 25) {
    return {
      headline: 'Moderate Volatility',
      detail: `${vixText}Good premiums available. Consider spreads and selective condors with wider strikes.`,
    };
  }
  if (vix && vix >= 25) {
    return {
      headline: 'Elevated Volatility',
      detail: `${vixText}High premiums but increased risk. Focus on defined-risk spreads with smaller position sizes.`,
    };
  }

  // Fallback: infer from strategy mix
  if (hasCondors && hasCovered) {
    return {
      headline: 'Low Volatility Environment',
      detail: 'Ideal conditions for iron condors and covered calls. Wide ranges, high probability of profit.',
    };
  }
  if (hasSpreads && !hasCondors) {
    return {
      headline: 'Directional Bias Detected',
      detail: 'Market favoring directional spreads. Consider bull put and call spreads for defined-risk trades.',
    };
  }
  return {
    headline: 'Strategies Updated',
    detail: `${tiles.length} strategies available — sorted by return on capital.`,
  };
}

export function DiscoverPage({ tiles }) {
  const navigate = useNavigate();
  const { isInPortfolio } = usePortfolio();
  const { addToShortlist, isShortlisted } = useShortlist();
  const { marketState } = useMarketState();
  const [filter, setFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(true); // Filter panel open by default

  // Advanced filter state (confidence removed — lives on detail page only)
  const [filters, setFilters] = useState({
    rewardRiskMin: -10, // Allow negative values for complex strategies
    rewardRiskMax: 10,
    riskLevelMin: 0,
    riskLevelMax: 100,
    dteMin: 0,
    dteMax: 90,
  });

  // Filter strategy types from available tiles
  const strategyTypes = useMemo(() => {
    const types = new Set();
    tiles.forEach(t => {
      const s = (t.strategy || '').toLowerCase().replace(/_/g, ' ');
      if (s.includes('iron condor')) types.add('iron condors');
      else if (s.includes('diagonal')) types.add('diagonals');
      else if (s.includes('calendar')) types.add('calendars');
      else if (s.includes('butterfly')) types.add('butterflies');
      else if (s.includes('collar')) types.add('collars');
      else if (s.includes('spread')) types.add('spreads');
      else if (s.includes('covered')) types.add('covered');
      else if (s.includes('straddle') || s.includes('strangle')) types.add('volatility');
      else types.add('other');
    });
    return ['all', ...Array.from(types)];
  }, [tiles]);

  const filteredTiles = useMemo(() => {
    // First, deduplicate tiles by ID (keep the one with highest returnOnCapital)
    const uniqueTilesMap = new Map();
    tiles.forEach(t => {
      if (!t.id) return;
      const existing = uniqueTilesMap.get(t.id);
      if (!existing || (t.returnOnCapital || 0) > (existing.returnOnCapital || 0)) {
        uniqueTilesMap.set(t.id, t);
      }
    });

    let result = Array.from(uniqueTilesMap.values()).filter(t => {
      // Exclude owned tiles — they live on /trading/positions (Defend phase)
      if (isInPortfolio(t.id)) return false;

      // More comprehensive data check - include tiles that have legs or any profit/loss data
      const hasData = (
        t.lottery?.maxWin > 0 ||
        t.technical?.maxLoss > 0 ||
        t.maxProfit > 0 ||
        t.maxLoss > 0 ||
        (t.legs && t.legs.length > 0) ||
        t.technical?.maxProfit > 0 ||
        t.returnOnCapital > 0
      );
      return hasData;
    });

    // Strategy type filter
    if (filter === 'iron condors') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('iron condor'));
    } else if (filter === 'diagonals') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('diagonal'));
    } else if (filter === 'calendars') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('calendar'));
    } else if (filter === 'butterflies') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('butterfly'));
    } else if (filter === 'collars') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('collar'));
    } else if (filter === 'volatility') {
      result = result.filter(t => {
        const s = (t.strategy || '').toLowerCase().replace(/_/g, ' ');
        return s.includes('straddle') || s.includes('strangle');
      });
    } else if (filter === 'spreads') {
      result = result.filter(t => {
        const s = (t.strategy || '').toLowerCase().replace(/_/g, ' ');
        return s.includes('spread') && !s.includes('iron condor');
      });
    } else if (filter === 'covered') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('covered'));
    }

    // Advanced filters
    result = result.filter(t => {
      const metrics = calculateMetrics(t);
      const maxProfit = t.maxProfit ?? t.lottery?.maxWin ?? t.technical?.maxProfit ?? metrics.maxProfit;
      const maxLoss = t.maxLoss ?? t.technical?.maxLoss ?? t.lottery?.ticketCost ?? metrics.maxLoss;

      // Calculate reward:risk with special handling
      let rewardRisk = 0;
      if (maxLoss > 0) {
        rewardRisk = maxProfit / maxLoss;
      } else if (maxProfit > 0) {
        // Undefined risk (unlimited upside) - use high value
        rewardRisk = 999;
      }

      const probProfit = t.oddsOfProfit || t.probOfProfit || t.lottery?.oddsOfProfit || t.technical?.probability || 0;
      const riskLevel = Math.min(Math.max(100 - probProfit, 0), 100);
      const dte = t.daysToExpiry || 0;
      // Check all filter ranges
      const passesRewardRisk = rewardRisk >= filters.rewardRiskMin && rewardRisk <= filters.rewardRiskMax;
      const passesRiskLevel = riskLevel >= filters.riskLevelMin && riskLevel <= filters.riskLevelMax;
      const passesDte = dte >= filters.dteMin && dte <= filters.dteMax;

      return passesRewardRisk && passesRiskLevel && passesDte;
    });

    // Sort by return on capital descending
    return result.sort((a, b) => {
      const aRoc = a.returnOnCapital || a.technical?.returnOnCapital || 0;
      const bRoc = b.returnOnCapital || b.technical?.returnOnCapital || 0;
      return bRoc - aRoc;
    });
  }, [tiles, filter, isInPortfolio, filters]);

  const pulse = useMemo(() => getMarketPulse(filteredTiles, marketState), [filteredTiles, marketState]);

  const formatPct = (v) => {
    if (!v || isNaN(v)) return '0%';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  };

  const formatCurr = (v) => {
    if (!v || isNaN(v)) return '$0';
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    return '$' + Math.round(v).toLocaleString();
  };

  // Build tabs for segmented control
  const tabs = strategyTypes.map(type => ({
    value: type,
    label: type === 'all' ? 'All' :
           type === 'iron condors' ? 'Iron Condors' :
           type === 'diagonals' ? 'Diagonals' :
           type === 'calendars' ? 'Calendars' :
           type === 'butterflies' ? 'Butterflies' :
           type === 'collars' ? 'Collars' :
           type === 'volatility' ? 'Volatility' :
           type.charAt(0).toUpperCase() + type.slice(1),
  }));

  // Reset all filters to default
  const resetFilters = () => {
    setFilters({
      rewardRiskMin: -10,
      rewardRiskMax: 10,
      riskLevelMin: 0,
      riskLevelMax: 100,
      dteMin: 0,
      dteMax: 90,
    });
  };

  // Update individual filter
  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Check if filters are at default values
  const hasActiveFilters =
    filters.rewardRiskMin !== -10 || filters.rewardRiskMax !== 10 ||
    filters.riskLevelMin !== 0 || filters.riskLevelMax !== 100 ||
    filters.dteMin !== 0 || filters.dteMax !== 90;

  return (
    <div className="nl-page">
      {/* Phase header + Filters */}
      <PhaseHeader
        currentPhase="discover"
        title="Discover Strategies"
        activeCount={filteredTiles.length || null}
        compact
      />
      <div className="nl-page-header" style={{ marginTop: -8 }}>
        <div />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <SegmentedTabs tabs={tabs} activeTab={filter} onChange={setFilter} />
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--nl-radius-pill)',
              border: showFilters ? '1.5px solid rgba(11, 45, 35,0.25)' : '1px solid var(--nl-border)',
              background: showFilters ? 'rgba(11, 45, 35,0.08)' : '#fff',
              fontSize: '12px',
              fontWeight: '800',
              color: showFilters ? 'rgba(11, 45, 35,0.95)' : 'rgba(17,24,39,0.72)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🎚️ Filters
            {hasActiveFilters && (
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--nl-soft-gold)',
              }} />
            )}
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="nl-filter-panel">
          <div className="nl-filter-header">
            <h3>Advanced Filters</h3>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="nl-filter-reset">
                Reset All
              </button>
            )}
          </div>

          <div className="nl-filter-grid">
            {/* Reward:Risk Filter */}
            <div className="nl-filter-group">
              <label className="nl-filter-label">
                Reward:Risk Ratio
                <span className="nl-filter-value">
                  {filters.rewardRiskMin >= 0 ? filters.rewardRiskMin.toFixed(1) : filters.rewardRiskMin.toFixed(1)}× - {filters.rewardRiskMax.toFixed(1)}×
                </span>
              </label>
              <div className="nl-dual-slider">
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  value={filters.rewardRiskMin}
                  onChange={(e) => updateFilter('rewardRiskMin', parseFloat(e.target.value))}
                  className="nl-range-input"
                />
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  value={filters.rewardRiskMax}
                  onChange={(e) => updateFilter('rewardRiskMax', parseFloat(e.target.value))}
                  className="nl-range-input"
                />
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: 'var(--nl-muted-text-2)',
                marginTop: '4px'
              }}>
                <span>Complex strategies (negative R:R)</span>
                <span>High R:R strategies</span>
              </div>
            </div>

            {/* Risk Level Filter */}
            <div className="nl-filter-group">
              <label className="nl-filter-label">
                Risk Level
                <span className="nl-filter-value">{filters.riskLevelMin}% - {filters.riskLevelMax}%</span>
              </label>
              <div className="nl-dual-slider">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={filters.riskLevelMin}
                  onChange={(e) => updateFilter('riskLevelMin', parseInt(e.target.value))}
                  className="nl-range-input"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={filters.riskLevelMax}
                  onChange={(e) => updateFilter('riskLevelMax', parseInt(e.target.value))}
                  className="nl-range-input"
                />
              </div>
            </div>

            {/* Days to Expiry Filter */}
            <div className="nl-filter-group">
              <label className="nl-filter-label">
                Days to Expiry (DTE)
                <span className="nl-filter-value">{filters.dteMin} - {filters.dteMax} days</span>
              </label>
              <div className="nl-dual-slider">
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="1"
                  value={filters.dteMin}
                  onChange={(e) => updateFilter('dteMin', parseInt(e.target.value))}
                  className="nl-range-input"
                />
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="1"
                  value={filters.dteMax}
                  onChange={(e) => updateFilter('dteMax', parseInt(e.target.value))}
                  className="nl-range-input"
                />
              </div>
            </div>

          </div>

          <div className="nl-filter-footer">
            <div className="nl-filter-result-count">
              Showing <strong>{filteredTiles.length}</strong> {filteredTiles.length === 1 ? 'strategy' : 'strategies'}
            </div>
          </div>
        </div>
      )}

      {/* Market regime — single line, actionable context only */}
      <div className="nl-mb-md" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 12,
        background: 'rgba(11,45,35,0.04)', border: '1px solid rgba(11,45,35,0.08)',
      }}>
        <span style={{ fontSize: 14 }}>📡</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nl-text)' }}>
          {pulse.headline}
        </span>
        <span style={{ fontSize: 12, color: 'var(--nl-muted-text)' }}>
          &middot; {filteredTiles.length} {filteredTiles.length === 1 ? 'strategy' : 'strategies'} available
        </span>
      </div>

      {/* Strategy Cards Grid */}
      {filteredTiles.length === 0 ? (
        <div className="nl-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '900' }}>
            No strategies match this filter
          </h3>
          <p style={{ margin: 0, color: 'var(--nl-muted-text)', fontSize: '13px' }}>
            Try selecting a different filter above, or check back when new strategies are generated.
          </p>
        </div>
      ) : (
        <div className="nl-grid-2">
          {filteredTiles.map(tile => {
            const metrics = calculateMetrics(tile);
            const maxProfit = tile.maxProfit ?? tile.lottery?.maxWin ?? tile.technical?.maxProfit ?? metrics.maxProfit;
            const maxLoss = tile.maxLoss ?? tile.technical?.maxLoss ?? tile.lottery?.ticketCost ?? metrics.maxLoss;
            const probProfit = tile.oddsOfProfit || tile.probOfProfit || tile.lottery?.oddsOfProfit || tile.technical?.probability || 0;
            const dte = tile.daysToExpiry || 0;

            // Calculate Reward:Risk ratio
            let rewardRiskDisplay = '—';
            if (maxLoss > 0) {
              const rr = maxProfit / maxLoss;
              rewardRiskDisplay = `${rr.toFixed(2)}×`;
            } else if (maxProfit > 0) {
              rewardRiskDisplay = '∞';
            }

            const riskFillWidth = Math.min(Math.max(100 - probProfit, 10), 90);
            const saved = isShortlisted(tile.id);

            const strategyMetrics = [
              { label: 'Reward:Risk', value: rewardRiskDisplay, positive: true, primary: true },
              { label: 'Max Profit', value: formatCurr(maxProfit), positive: true },
              { label: 'Max Loss', value: formatCurr(maxLoss), negative: true },
              { label: 'Probability', value: probProfit.toFixed(0) + '%' },
            ];

            return (
              <StrategyCard
                key={tile.id}
                symbol={tile.symbol}
                companyName={COMPANY_NAMES[tile.symbol]}
                strategy={formatStrategy(tile.strategy)}
                dte={dte}
                metrics={strategyMetrics}
                riskLevel={riskFillWidth}
                onTakeTrade={() => navigate(`/invest/build?add=${tile.id}`)}
                onSaveForLater={() => { if (!saved) addToShortlist(tile); }}
                isSaved={saved}
                onClick={() => navigate(`/invest/strategy/${tile.id}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import { useMarketState } from '../hooks/useMarketState';
import { formatStrategy } from '../utils/formatters';
import { calculateMetrics } from '../utils/optionsCalc';
import { getStrategyTheme } from '../utils/strategyThemes';

// Ticker badge colors — give each symbol a recognisable color
const TICKER_COLORS = {
  AMZN: { bg: '#FFF3E0', color: '#E65100' },
  AAPL: { bg: '#E3F2FD', color: '#1565C0' },
  SPY:  { bg: '#E8F5E9', color: '#2E7D32' },
  MSFT: { bg: '#F3E5F5', color: '#6A1B9A' },
  NVDA: { bg: '#FFF8E1', color: '#F57F17' },
  GOOGL:{ bg: '#E0F2F1', color: '#00695C' },
  GOOG: { bg: '#E0F2F1', color: '#00695C' },
  META: { bg: '#E3F2FD', color: '#1565C0' },
  TSLA: { bg: '#FCE4EC', color: '#C62828' },
  NFLX: { bg: '#FCE4EC', color: '#B71C1C' },
  AMD:  { bg: '#FFF3E0', color: '#E65100' },
  QQQ:  { bg: '#E8F5E9', color: '#2E7D32' },
  IWM:  { bg: '#F3E5F5', color: '#6A1B9A' },
};
const DEFAULT_BADGE = { bg: '#F3F4F6', color: '#374151' };

const COMPANY_NAMES = {
  AMZN: 'Amazon', AAPL: 'Apple', SPY: 'S&P 500 ETF', MSFT: 'Microsoft',
  NVDA: 'Nvidia', GOOGL: 'Alphabet', GOOG: 'Alphabet', META: 'Meta',
  TSLA: 'Tesla', NFLX: 'Netflix', QQQ: 'Nasdaq 100', IWM: 'Russell 2000',
  AMD: 'AMD', DIS: 'Disney', JPM: 'JPMorgan', V: 'Visa', MA: 'Mastercard',
  BA: 'Boeing', COST: 'Costco', CRM: 'Salesforce',
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
  const { addToPortfolio, isInPortfolio } = usePortfolio();
  const { marketState } = useMarketState();
  const [filter, setFilter] = useState('all');

  // Filter strategy types from available tiles
  const strategyTypes = useMemo(() => {
    const types = new Set();
    tiles.forEach(t => {
      const s = (t.strategy || '').toLowerCase().replace(/_/g, ' ');
      if (s.includes('iron condor')) types.add('iron condors');
      else if (s.includes('spread')) types.add('spreads');
      else if (s.includes('covered')) types.add('covered');
      else types.add('other');
    });
    return ['all', ...Array.from(types), 'saved'];
  }, [tiles]);

  const filteredTiles = useMemo(() => {
    let result = tiles.filter(t => {
      const hasData = (t.lottery?.maxWin > 0 || t.technical?.maxLoss > 0 || t.maxProfit > 0);
      return hasData;
    });

    if (filter === 'iron condors') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('iron condor'));
    } else if (filter === 'spreads') {
      result = result.filter(t => {
        const s = (t.strategy || '').toLowerCase().replace(/_/g, ' ');
        return s.includes('spread') && !s.includes('iron condor');
      });
    } else if (filter === 'covered') {
      result = result.filter(t => (t.strategy || '').toLowerCase().replace(/_/g, ' ').includes('covered'));
    } else if (filter === 'saved') {
      result = result.filter(t => isInPortfolio(t.id));
    }

    // Sort by return on capital descending
    return result.sort((a, b) => {
      const aRoc = a.returnOnCapital || a.technical?.returnOnCapital || 0;
      const bRoc = b.returnOnCapital || b.technical?.returnOnCapital || 0;
      return bRoc - aRoc;
    });
  }, [tiles, filter, isInPortfolio]);

  const pulse = useMemo(() => getMarketPulse(filteredTiles, marketState), [filteredTiles, marketState]);

  const handleAdd = async (e, tile) => {
    e.stopPropagation();
    if (!isInPortfolio(tile.id)) {
      try { await addToPortfolio(tile); } catch (err) { console.error(err); }
    }
  };

  const formatPct = (v) => {
    if (!v || isNaN(v)) return '0%';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  };

  const formatCurr = (v) => {
    if (!v || isNaN(v)) return '$0';
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    return '$' + Math.round(v).toLocaleString();
  };

  return (
    <div className="page-body">
      {/* Header + Filters */}
      <div className="discover-header">
        <div>
          <h1>Discover Strategies</h1>
          <p>Curated options strategies matched to your risk profile and market conditions</p>
        </div>
        <div className="discover-filters">
          {strategyTypes.map(type => (
            <button
              key={type}
              className={`filter-btn${filter === type ? ' active' : ''}`}
              onClick={() => setFilter(type)}
            >
              {type === 'all' ? 'All' :
               type === 'saved' ? 'Saved ★' :
               type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Market Pulse Bar */}
      <div className="discover-pulse">
        <div className="dp-icon">📡</div>
        <div className="dp-text">
          <strong>Market Pulse: {pulse.headline}</strong>
          <span>{pulse.detail}</span>
        </div>
        <span className="dp-badge">{filteredTiles.length} strategies</span>
      </div>

      {/* Strategy Cards Grid */}
      {filteredTiles.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-icon">🔍</div>
          <h3>No strategies match this filter</h3>
          <p>Try selecting a different filter above, or check back when new strategies are generated.</p>
        </div>
      ) : (
        <div className="discover-grid">
          {filteredTiles.map(tile => {
            const metrics = calculateMetrics(tile);
            const maxReturn = tile.returnOnCapital || tile.technical?.returnOnCapital || tile.technical?.roi ||
              (metrics.maxLoss > 0 ? (metrics.maxProfit / metrics.maxLoss) * 100 : 0);
            const maxRisk = tile.technical?.maxLoss || tile.maxLoss || metrics.maxLoss;
            const maxRiskPct = tile.technical?.riskPercent || (maxRisk > 0 && maxReturn > 0 ? (maxRisk / (maxRisk + metrics.maxProfit)) * 100 : 50);
            const probProfit = tile.oddsOfProfit || tile.probOfProfit || tile.lottery?.oddsOfProfit || tile.technical?.probability || 0;
            const capital = tile.lottery?.ticketCost || tile.technical?.maxLoss || maxRisk;
            const dte = tile.daysToExpiry || 0;

            const badgeColors = TICKER_COLORS[tile.symbol] || DEFAULT_BADGE;
            const theme = getStrategyTheme(tile.strategy);
            const riskFillWidth = Math.min(Math.max(100 - probProfit, 10), 90);
            const riskColor = probProfit >= 70 ? 'var(--leaf-500)' :
                              probProfit >= 50 ? 'var(--amber)' : 'var(--loss)';
            const inPortfolio = isInPortfolio(tile.id);

            return (
              <div key={tile.id} className="strategy-card" onClick={() => navigate(`/invest/position/${tile.id}`)}>
                <div className="sc-top">
                  <div className="sc-left">
                    <div className="sc-ticker-badge" style={{ background: badgeColors.bg, color: badgeColors.color }}>
                      {tile.symbol}
                    </div>
                    <div className="sc-ticker-info">
                      <h4>{COMPANY_NAMES[tile.symbol] || tile.symbol}</h4>
                      <span>{formatStrategy(tile.strategy)} · {dte} DTE</span>
                    </div>
                  </div>
                  <span className="sc-type" style={{ background: theme.light, color: theme.dark, border: `1px solid ${theme.light}` }}>
                    {formatStrategy(tile.strategy)}
                  </span>
                </div>

                <div className="sc-metrics">
                  <div className="sc-metric">
                    <div className="sc-metric-label">Max Return</div>
                    <div className="sc-metric-val" style={{ color: 'var(--profit)' }}>{formatPct(maxReturn)}</div>
                  </div>
                  <div className="sc-metric">
                    <div className="sc-metric-label">Max Risk</div>
                    <div className="sc-metric-val" style={{ color: 'var(--loss)' }}>{formatCurr(maxRisk)}</div>
                  </div>
                  <div className="sc-metric">
                    <div className="sc-metric-label">Prob. Profit</div>
                    <div className="sc-metric-val">{probProfit.toFixed(0)}%</div>
                  </div>
                  <div className="sc-metric">
                    <div className="sc-metric-label">Capital</div>
                    <div className="sc-metric-val">{formatCurr(capital)}</div>
                  </div>
                </div>

                <div className="sc-bottom">
                  <div className="sc-risk-bar-wrap">
                    <div className="sc-risk-label">Risk Level</div>
                    <div className="sc-risk-track">
                      <div className="sc-risk-fill" style={{ width: `${riskFillWidth}%`, background: riskColor }} />
                    </div>
                  </div>
                  <button
                    className={`sc-add-btn${inPortfolio ? ' added' : ''}`}
                    onClick={(e) => handleAdd(e, tile)}
                  >
                    {inPortfolio ? '✓ Added' : '+ Add to Portfolio'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

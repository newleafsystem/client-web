import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import { useVerdict, VERDICT_STATES, VERDICT_CONFIG } from '../hooks/useVerdict';
import { usePositionLiveData } from '../hooks/usePositionLiveData';
import { formatStrategy, formatCurrency } from '../utils/formatters';
import { PhaseHeader } from '../components/PhaseHeader';
import { SentimentBadge } from '../components/SentimentBadge';

/**
 * /trading/positions — Defend phase. Active positions with verdicts.
 *
 * All active positions sorted by verdict urgency:
 * EXIT > ACTION_NEEDED > TAKE_PROFIT > MONITOR > ON_TRACK
 *
 * Each card shows verdict pill, symbol, strategy, P&L, and a
 * verdict-driven primary action CTA.
 *
 * Phase 2: skeleton only. Full implementation in Phase 6.
 */

const VERDICT_PRIORITY = {
  [VERDICT_STATES.EXIT]: 0,
  [VERDICT_STATES.ACTION_NEEDED]: 1,
  [VERDICT_STATES.TAKE_PROFIT]: 2,
  [VERDICT_STATES.MONITOR]: 3,
  [VERDICT_STATES.ON_TRACK]: 4,
};

function PositionCard({ item, tile, navigate }) {
  const liveData = usePositionLiveData(tile, item);
  const verdict = useVerdict(item.tileId, tile, liveData);
  const cfg = VERDICT_CONFIG[verdict.state];
  const pnl = liveData.pnlTotal || (item.unrealizedPnl || 0) * (item.quantity || 1);

  return (
    <div
      onClick={() => navigate(`/invest/strategy/${item.tileId}`)}
      style={{
        background: '#fff', border: '1px solid rgba(17,24,39,0.10)',
        borderRadius: 16, padding: 16, cursor: 'pointer',
        borderLeft: `3px solid ${cfg.color}`,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(17,24,39,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              display: 'inline-block', padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              letterSpacing: '.08em', textTransform: 'uppercase',
              background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            }}>
              {cfg.label}
            </span>
            {tile?.sentiment && <SentimentBadge sentiment={tile.sentiment} />}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>
            {item.symbol}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {formatStrategy(item.strategy)} &middot; {(() => {
              const dte = tile?.daysToExpiry ?? (tile?.expiry ? Math.max(0, Math.round((new Date(tile.expiry + 'T16:00:00') - new Date()) / 86400000)) : null) ?? (item?.expiry ? Math.max(0, Math.round((new Date(item.expiry + 'T16:00:00') - new Date()) / 86400000)) : null);
              return dte != null ? dte : '--';
            })()} DTE
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700,
            color: pnl >= 0 ? '#0B7A52' : '#C94F4F',
          }}>
            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {item.quantity || 1} contract{(item.quantity || 1) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>
        {verdict.reason}
      </div>
    </div>
  );
}

export function PositionsPage({ tiles }) {
  const navigate = useNavigate();
  const { portfolioItems, loading } = usePortfolio();

  const activePositions = portfolioItems
    .filter(item => item.status === 'active')
    .sort((a, b) => {
      // Phase 2: all ON_TRACK, so sort by symbol
      const pa = VERDICT_PRIORITY[VERDICT_STATES.ON_TRACK];
      const pb = VERDICT_PRIORITY[VERDICT_STATES.ON_TRACK];
      return pa - pb || (a.symbol || '').localeCompare(b.symbol || '');
    });

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 0 60px' }}>
      {/* Phase header */}
      <PhaseHeader
        currentPhase="defend"
        title="Positions"
        subtitle="Active positions sorted by urgency. Verdict-driven actions."
        activeCount={activePositions.length || null}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading positions...</div>
      ) : activePositions.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#128203;</div>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 400, color: '#0B2D23', marginBottom: 8 }}>
            No active positions
          </h3>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
            Build a portfolio from Discover to start tracking positions here.
          </p>
          <button
            onClick={() => navigate('/invest/discover')}
            style={{ padding: '10px 20px', background: '#0B2D23', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Go to Discover
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activePositions.map(item => (
            <PositionCard
              key={item.id}
              item={item}
              tile={tiles?.find(t => t.id === item.tileId)}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

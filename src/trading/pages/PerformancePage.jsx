import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePortfolioSettings } from '../hooks/usePortfolioSettings';
import { useAuth } from '../../shared/hooks/useAuth';
import { calculateMetrics } from '../utils/optionsCalc';
import { formatStrategy } from '../utils/formatters';

export function PerformancePage({ tiles }) {
  const { portfolioItems, updatePortfolioItem } = usePortfolio();
  const { settings } = usePortfolioSettings();
  const { user } = useAuth();
  const [pnlHistory, setPnlHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [closingId, setClosingId] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);

  // Load P&L history snapshots
  useEffect(() => {
    if (!user) return;
    const loadHistory = async () => {
      try {
        const ref = collection(db, 'users', user.uid, 'pnlHistory');
        const q = query(ref, orderBy('date', 'asc'));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPnlHistory(docs);
      } catch (err) {
        console.error('Error loading P&L history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, [user]);

  // Separate active vs closed positions
  const { activePositions, closedPositions } = useMemo(() => {
    const active = [];
    const closed = [];
    portfolioItems.forEach(item => {
      if (item.status === 'closed') {
        closed.push(item);
      } else {
        active.push(item);
      }
    });
    // Sort closed by closedAt descending
    closed.sort((a, b) => {
      const dateA = a.closedAt?.toDate?.() || new Date(a.closedAt || 0);
      const dateB = b.closedAt?.toDate?.() || new Date(b.closedAt || 0);
      return dateB - dateA;
    });
    return { activePositions: active, closedPositions: closed };
  }, [portfolioItems]);

  // Compute all stats from REAL data
  const stats = useMemo(() => {
    const totalCapital = settings?.totalCapital || 100000;

    // Join active positions with tiles
    const joined = activePositions.map(pi => {
      const tile = tiles.find(t => t.id === pi.tileId);
      return { ...pi, tile };
    }).filter(i => i.tile);

    // Total unrealized P&L from active positions
    const totalUnrealizedPnl = activePositions.reduce((sum, p) => {
      return sum + ((p.unrealizedPnl || 0) * (p.quantity || 1));
    }, 0);

    // Total realized P&L from closed positions
    const totalRealizedPnl = closedPositions.reduce((sum, p) => {
      return sum + ((p.unrealizedPnl || p.realizedPnl || 0) * (p.quantity || 1));
    }, 0);

    const totalPnl = totalUnrealizedPnl + totalRealizedPnl;
    const totalReturnPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;

    // Win rate from closed positions
    const closedWithPnl = closedPositions.filter(p => (p.unrealizedPnl || p.realizedPnl || 0) !== 0);
    const winners = closedWithPnl.filter(p => (p.unrealizedPnl || p.realizedPnl || 0) > 0);
    const winRate = closedWithPnl.length > 0
      ? Math.round((winners.length / closedWithPnl.length) * 100)
      : null;
    const winCount = winners.length;
    const totalTrades = closedWithPnl.length;

    // Capital deployed (from active positions)
    let capitalDeployed = 0;
    joined.forEach(item => {
      const metrics = calculateMetrics(item.tile);
      const maxLoss = item.tile.technical?.maxLoss || item.tile.maxLoss || metrics.maxLoss || 0;
      capitalDeployed += Math.abs(maxLoss) * (item.quantity || 1);
    });

    // Monthly returns from P&L history snapshots
    const monthlyReturns = [];
    if (pnlHistory.length >= 2) {
      for (let i = 1; i < pnlHistory.length; i++) {
        const prevPnl = pnlHistory[i - 1].totalPnl || 0;
        const currPnl = pnlHistory[i].totalPnl || 0;
        const diff = currPnl - prevPnl;
        const pct = totalCapital > 0 ? (diff / totalCapital) * 100 : 0;
        const date = pnlHistory[i].date;
        const [y, m] = date.split('-');
        const monthLabel = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthlyReturns.push({ label: monthLabel, val: parseFloat(pct.toFixed(1)), date, pnlDiff: diff });
      }
    }

    const activeMonths = monthlyReturns.filter(m => m.val !== 0);
    const avgMonthly = activeMonths.length > 0
      ? (activeMonths.reduce((s, m) => s + m.val, 0) / activeMonths.length)
      : 0;
    const bestMonth = monthlyReturns.length > 0
      ? monthlyReturns.reduce((best, m) => m.val > best.val ? m : best, monthlyReturns[0])
      : null;

    // Strategy allocation for pie chart
    const allocations = [];
    const COLORS = ['#0B2D23', '#1a5e44', '#C9A96E', '#a8893a', '#2d8a64', '#3ba876', '#dcc88a'];
    let totalRisk = 0;
    joined.forEach(item => {
      const metrics = calculateMetrics(item.tile);
      const cost = Math.abs(item.tile.technical?.maxLoss || item.tile.maxLoss || metrics.maxLoss || 0);
      totalRisk += cost * (item.quantity || 1);
    });
    joined.forEach((item, i) => {
      const metrics = calculateMetrics(item.tile);
      const cost = Math.abs(item.tile.technical?.maxLoss || item.tile.maxLoss || metrics.maxLoss || 0) * (item.quantity || 1);
      const pct = totalRisk > 0 ? Math.round((cost / totalRisk) * 100) : 0;
      allocations.push({
        name: item.tile.symbol + ' ' + formatStrategy(item.tile.strategy),
        pct,
        color: COLORS[i % COLORS.length],
      });
    });

    // Dynamic milestones
    const milestones = [];
    if (closedPositions.length > 0) {
      const first = [...closedPositions].sort((a, b) => {
        const da = a.closedAt?.toDate?.() || new Date(a.closedAt || 0);
        const db_ = b.closedAt?.toDate?.() || new Date(b.closedAt || 0);
        return da - db_;
      })[0];
      const pnl = (first.unrealizedPnl || first.realizedPnl || 0) * (first.quantity || 1);
      const closedDate = first.closedAt?.toDate?.() || new Date(first.closedAt || 0);
      const dateStr = closedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const pnlStr = (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(0);
      milestones.push({
        icon: '\u{1F331}', reached: true,
        title: 'First Trade Closed',
        desc: first.symbol + ' ' + formatStrategy(first.strategy || '') + ' \u2014 ' + pnlStr + ', ' + dateStr
      });
    } else {
      milestones.push({
        icon: '\u{1F331}', reached: false,
        title: 'First Trade Closed',
        desc: 'Close your first position to unlock'
      });
    }

    const profitMilestones = [500, 1000, 2500, 5000, 10000, 25000, 50000];
    let highestReached = 0;
    profitMilestones.forEach(target => {
      if (totalPnl >= target) highestReached = target;
    });
    if (highestReached > 0) {
      milestones.push({
        icon: '\u{1F4B0}', reached: true,
        title: '$' + highestReached.toLocaleString() + ' Total Profit',
        desc: 'Milestone reached!'
      });
    }
    const nextTarget = profitMilestones.find(t => t > totalPnl);
    if (nextTarget) {
      const progress = totalPnl > 0 ? Math.round((totalPnl / nextTarget) * 100) : 0;
      milestones.push({
        icon: '\u{1F3AF}', reached: false,
        title: '$' + nextTarget.toLocaleString() + ' Total Profit',
        desc: totalPnl > 0 ? progress + '% progress' : 'Start trading to make progress'
      });
    }

    if (activePositions.length >= 5) {
      milestones.push({
        icon: '\u{1F4CA}', reached: true,
        title: 'Diversified Portfolio',
        desc: activePositions.length + ' active positions'
      });
    } else if (activePositions.length > 0) {
      milestones.push({
        icon: '\u{1F4CA}', reached: false,
        title: 'Diversified Portfolio',
        desc: activePositions.length + '/5 positions \u2014 add more to diversify'
      });
    }

    return {
      totalPnl,
      totalReturnPct,
      totalUnrealizedPnl,
      totalRealizedPnl,
      avgMonthly,
      bestMonth,
      winRate,
      winCount,
      totalTrades,
      capitalDeployed,
      totalCapital,
      activeCount: joined.length,
      allocations,
      monthlyReturns,
      milestones,
    };
  }, [portfolioItems, activePositions, closedPositions, tiles, settings, pnlHistory]);

  // Build growth chart from P&L history + current live state
  const growthChart = useMemo(() => {
    const totalCapital = settings?.totalCapital || 100000;
    const livePnl = stats.totalPnl || 0;
    const today = new Date().toISOString().split('T')[0];

    const points = pnlHistory.map(snap => ({
      date: snap.date,
      value: totalCapital + (snap.totalPnl || 0),
      pnl: snap.totalPnl || 0,
    }));

    const lastSnap = points[points.length - 1];
    if (!lastSnap || lastSnap.date !== today || Math.abs(lastSnap.pnl - livePnl) > 1) {
      points.push({ date: today, value: totalCapital + livePnl, pnl: livePnl });
    }

    if (points.length > 0 && points[0].pnl !== 0) {
      points.unshift({ date: 'start', value: totalCapital, pnl: 0 });
    }

    return points.length >= 2 ? points : null;
  }, [pnlHistory, settings, stats.totalPnl]);

  // SVG growth chart path builder
  const growthSvg = useMemo(() => {
    if (!growthChart || growthChart.length < 2) return null;
    const values = growthChart.map(p => p.value);
    const minVal = Math.min(...values) * 0.998;
    const maxVal = Math.max(...values) * 1.002;
    const range = maxVal - minVal || 1;
    const w = 600, h = 240;

    const pts = growthChart.map((p, i) => ({
      x: (i / (growthChart.length - 1)) * w,
      y: h - ((p.value - minVal) / range) * h,
    }));

    let linePath = 'M' + pts[0].x + ',' + pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3;
      const cp2x = pts[i].x - (pts[i].x - pts[i - 1].x) / 3;
      linePath += ' C' + cp1x + ',' + pts[i - 1].y + ' ' + cp2x + ',' + pts[i].y + ' ' + pts[i].x + ',' + pts[i].y;
    }
    const areaPath = linePath + ' L' + w + ',' + h + ' L0,' + h + ' Z';

    const yLabels = [];
    for (let i = 0; i <= 4; i++) {
      const val = minVal + (range * (4 - i)) / 4;
      yLabels.push(val >= 1000 ? '$' + (val / 1000).toFixed(0) + 'K' : '$' + val.toFixed(0));
    }

    const xLabels = growthChart
      .filter((_, i) => i % Math.max(1, Math.floor(growthChart.length / 6)) === 0 || i === growthChart.length - 1)
      .map(p => {
        if (p.date === 'start') return 'Start';
        const parts = p.date.split('-');
        return parseInt(parts[1]) + '/' + parseInt(parts[2]);
      });

    const lastPt = pts[pts.length - 1];
    return { linePath, areaPath, yLabels, xLabels, lastPt };
  }, [growthChart]);

  // Build SVG pie chart segments
  const circumference = 2 * Math.PI * 70;
  const pieSegments = [];
  let dashOffset = 0;
  stats.allocations.forEach((a, i) => {
    const dashLen = (a.pct / 100) * circumference;
    pieSegments.push(
      <circle key={i} cx="100" cy="100" r="70" fill="none"
        stroke={a.color} strokeWidth="28"
        strokeDasharray={dashLen + ' ' + (circumference - dashLen)}
        strokeDashoffset={-dashOffset}
        transform="rotate(-90 100 100)"
      />
    );
    dashOffset += dashLen;
  });

  const formatPnl = (val) => {
    const abs = Math.abs(val);
    const sign = val >= 0 ? '+' : '-';
    return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // Close a position: set status to closed, lock in P&L, record timestamp
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

  return (
    <div className="page-body">
      <div className="perf-header">
        <h1>Performance</h1>
        <p>Track your portfolio growth, returns, and trade history</p>
      </div>

      {/* Top Stats */}
      <div className="perf-top-stats">
        <div className="pts-box">
          <div className="pts-label">Total P&L</div>
          <div className="pts-val" style={{ color: stats.totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
            {formatPnl(stats.totalPnl)}
          </div>
          <div className="pts-sub">
            {stats.totalReturnPct >= 0 ? '+' : ''}{stats.totalReturnPct.toFixed(1)}% of portfolio
          </div>
        </div>
        <div className="pts-box">
          <div className="pts-label">Unrealized</div>
          <div className="pts-val" style={{ color: stats.totalUnrealizedPnl >= 0 ? 'var(--leaf-700)' : 'var(--loss)' }}>
            {formatPnl(stats.totalUnrealizedPnl)}
          </div>
          <div className="pts-sub">{activePositions.length} active position{activePositions.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="pts-box">
          <div className="pts-label">Realized</div>
          <div className="pts-val" style={{ color: stats.totalRealizedPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
            {formatPnl(stats.totalRealizedPnl)}
          </div>
          <div className="pts-sub">{closedPositions.length} closed trade{closedPositions.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="pts-box">
          <div className="pts-label">Win Rate</div>
          <div className="pts-val">
            {stats.winRate !== null ? stats.winRate + '%' : '\u2014'}
          </div>
          <div className="pts-sub">
            {stats.totalTrades > 0
              ? stats.winCount + ' of ' + stats.totalTrades + ' trades'
              : 'No closed trades yet'}
          </div>
        </div>
      </div>

      {/* Growth Chart + Monthly Returns */}
      <div className="perf-layout">
        <div className="growth-card">
          <h3>Portfolio Growth</h3>
          <div className="sub">
            {'$' + (stats.totalCapital / 1000).toFixed(0) + 'K starting capital'}
            {pnlHistory.length > 0 && (' \u2014 ' + pnlHistory.length + ' snapshot' + (pnlHistory.length !== 1 ? 's' : ''))}
          </div>

          {growthSvg ? (
            <div className="growth-chart" style={{ marginLeft: 54 }}>
              <div className="gc-y-axis">
                {growthSvg.yLabels.map((label, i) => (
                  <span key={i} className="gc-y-label">{label}</span>
                ))}
              </div>
              <div className="gc-area">
                <svg viewBox="0 0 600 240" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                  <defs>
                    <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stats.totalPnl >= 0 ? '#0B2D23' : '#dc2626'} stopOpacity="0.12"/>
                      <stop offset="100%" stopColor={stats.totalPnl >= 0 ? '#0B2D23' : '#dc2626'} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="120" x2="600" y2="120" stroke="var(--gray-200)" strokeWidth="1" strokeDasharray="4,3"/>
                  <path d={growthSvg.areaPath} fill="url(#gg)"/>
                  <path d={growthSvg.linePath} fill="none"
                    stroke={stats.totalPnl >= 0 ? '#0B2D23' : '#dc2626'} strokeWidth="2.5"/>
                </svg>
              </div>
              <div className="gc-marker" style={{ right: 2, top: growthSvg.lastPt.y }}></div>
              <div className="gc-x-axis">
                {growthSvg.xLabels.map((m, i) => (
                  <span key={i} className="gc-x-label">{m}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u{1F4C8}'}</div>
              <p style={{ marginBottom: 4, fontWeight: 600, color: 'var(--gray-600)' }}>No snapshots yet</p>
              <p style={{ fontSize: 12 }}>
                Go to Admin → P&L Chart tab → Record Today's Snapshot to start tracking growth over time
              </p>
            </div>
          )}
        </div>

        <div className="monthly-card">
          <h3>Monthly Returns</h3>
          {stats.monthlyReturns.length > 0 ? (
            <div className="month-grid">
              {stats.monthlyReturns.slice(-9).map((m, i) => (
                <div key={i} className={'month-cell' + (m.val < 0 ? ' loss-cell' : '')}
                  style={m.val === 0 ? { background: 'var(--gray-50)', border: '1px dashed var(--gray-200)' } : undefined}>
                  <div className="mc-label">{m.label}</div>
                  <div className="mc-val" style={{
                    color: m.val < 0 ? 'var(--loss)' : m.val > 0 ? 'var(--profit)' : 'var(--gray-300)'
                  }}>
                    {m.val === 0 ? '\u2014' : (m.val > 0 ? '+' : '') + m.val.toFixed(1) + '%'}
                  </div>
                  {m.val !== 0 && (
                    <div className="mc-bar">
                      <div className="mc-bar-fill" style={{
                        width: Math.min(Math.abs(m.val) * 30, 100) + '%',
                        background: m.val < 0 ? 'var(--loss)' : 'var(--leaf-500)',
                      }}/>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u{1F4CA}'}</div>
              <p style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>No monthly data yet</p>
              <p style={{ fontSize: 12 }}>
                Record P&L snapshots over time to see monthly return breakdowns
              </p>
            </div>
          )}
          {stats.monthlyReturns.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--gray-500)' }}>
              <span>Avg: <strong style={{ color: stats.avgMonthly >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                {(stats.avgMonthly >= 0 ? '+' : '') + stats.avgMonthly.toFixed(1) + '%'}
              </strong></span>
              {stats.bestMonth && (
                <span>Best: <strong style={{ color: 'var(--profit)' }}>
                  {'+' + stats.bestMonth.val.toFixed(1) + '% (' + stats.bestMonth.label + ')'}
                </strong></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active Positions with Close Action */}
      {activePositions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="positions-card">
            <div className="pos-header">
              <h3>{'\u{1F4C8}'} Active Positions</h3>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>
                {activePositions.length} position{activePositions.length !== 1 ? 's' : ''}
                {' \u00B7 Unrealized: '}
                <span style={{ color: stats.totalUnrealizedPnl >= 0 ? 'var(--profit)' : 'var(--loss)', fontWeight: 600 }}>
                  {formatPnl(stats.totalUnrealizedPnl)}
                </span>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Strategy</th>
                    <th>Entry Credit</th>
                    <th>P&L</th>
                    <th>Return</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activePositions.map((pos, i) => {
                    const pnl = (pos.unrealizedPnl || 0) * (pos.quantity || 1);
                    const entry = Math.abs(pos.entryNetCredit || 0);
                    const returnPct = entry > 0 ? (pnl / entry) * 100 : 0;

                    // Determine health status based on P&L vs entry
                    let statusLabel = 'Healthy';
                    let statusColor = 'var(--profit)';
                    let statusBg = '#dcfce7';
                    if (entry > 0 && returnPct <= -50) {
                      statusLabel = 'Critical';
                      statusColor = '#dc2626';
                      statusBg = '#fef2f2';
                    } else if (entry > 0 && returnPct <= -25) {
                      statusLabel = 'At Risk';
                      statusColor = '#ea580c';
                      statusBg = '#fff7ed';
                    } else if (pnl < 0) {
                      statusLabel = 'Warning';
                      statusColor = '#d97706';
                      statusBg = '#fffbeb';
                    }

                    return (
                      <tr key={pos.id || i}>
                        <td><span className="adm-bold">{pos.symbol}</span></td>
                        <td><span className="adm-mono" style={{ color: 'var(--leaf-700)' }}>{formatStrategy(pos.strategy || '')}</span></td>
                        <td className="adm-mono">{entry > 0 ? '$' + entry.toFixed(0) : '\u2014'}</td>
                        <td>
                          <span className="adm-mono" style={{
                            fontWeight: 600,
                            color: pnl > 0 ? 'var(--profit)' : pnl < 0 ? 'var(--loss)' : 'var(--gray-500)'
                          }}>
                            {pnl !== 0 ? formatPnl(pnl) : '$0'}
                          </span>
                        </td>
                        <td>
                          <span className="adm-mono" style={{
                            color: returnPct > 0 ? 'var(--profit)' : returnPct < 0 ? 'var(--loss)' : 'var(--gray-500)'
                          }}>
                            {returnPct !== 0 ? (returnPct >= 0 ? '+' : '') + returnPct.toFixed(1) + '%' : '\u2014'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 10,
                            fontWeight: 600,
                            color: statusColor,
                            background: statusBg,
                          }}>
                            {statusLabel}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setConfirmClose(pos)}
                            disabled={closingId === pos.id}
                            style={{
                              padding: '4px 12px',
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 6,
                              border: '1px solid var(--gray-200)',
                              background: 'white',
                              color: 'var(--gray-600)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => { e.target.style.background = '#fef2f2'; e.target.style.color = '#dc2626'; e.target.style.borderColor = '#fca5a5'; }}
                            onMouseLeave={(e) => { e.target.style.background = 'white'; e.target.style.color = 'var(--gray-600)'; e.target.style.borderColor = 'var(--gray-200)'; }}
                          >
                            {closingId === pos.id ? 'Closing...' : 'Close'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Closed Trades History */}
      <div style={{ marginBottom: 24 }}>
        <div className="positions-card">
          <div className="pos-header">
            <h3>{'\u{1F4CB}'} Closed Trades History</h3>
            <span style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>
              {closedPositions.length} trade{closedPositions.length !== 1 ? 's' : ''}
              {stats.totalRealizedPnl !== 0 && (
                <>{' \u00B7 Total: '}<span style={{ color: stats.totalRealizedPnl >= 0 ? 'var(--profit)' : 'var(--loss)', fontWeight: 600 }}>
                  {formatPnl(stats.totalRealizedPnl)}
                </span></>
              )}
            </span>
          </div>
          {closedPositions.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Strategy</th>
                    <th>Entry Credit</th>
                    <th>P&L</th>
                    <th>Return</th>
                    <th>Reason</th>
                    <th>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map((pos, i) => {
                    const pnl = (pos.unrealizedPnl || pos.realizedPnl || 0) * (pos.quantity || 1);
                    const entry = Math.abs(pos.entryNetCredit || 0);
                    const returnPct = entry > 0 ? (pnl / entry) * 100 : 0;
                    const closedDate = pos.closedAt?.toDate?.()
                      || (pos.closedAt ? new Date(pos.closedAt) : null);
                    const dateStr = closedDate
                      ? closedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                      : '\u2014';
                    const reason = pos.closedReason === 'tile_removed' ? 'Tile removed'
                      : pos.closedReason === 'expired' ? 'Expired'
                      : pos.closedReason === 'manual' ? 'Manual close'
                      : pos.closedReason || '\u2014';

                    return (
                      <tr key={pos.id || i}>
                        <td><span className="adm-bold">{pos.symbol}</span></td>
                        <td><span className="adm-mono" style={{ color: 'var(--leaf-700)' }}>{formatStrategy(pos.strategy || '')}</span></td>
                        <td className="adm-mono">{entry > 0 ? '$' + entry.toFixed(0) : '\u2014'}</td>
                        <td>
                          <span className="adm-mono" style={{
                            fontWeight: 600,
                            color: pnl > 0 ? 'var(--profit)' : pnl < 0 ? 'var(--loss)' : 'var(--gray-500)'
                          }}>
                            {pnl !== 0 ? formatPnl(pnl) : '$0'}
                          </span>
                        </td>
                        <td>
                          <span className="adm-mono" style={{
                            color: returnPct > 0 ? 'var(--profit)' : returnPct < 0 ? 'var(--loss)' : 'var(--gray-500)'
                          }}>
                            {returnPct !== 0 ? (returnPct >= 0 ? '+' : '') + returnPct.toFixed(1) + '%' : '\u2014'}
                          </span>
                        </td>
                        <td>
                          <span className="adm-badge off" style={{ fontSize: 10 }}>{reason}</span>
                        </td>
                        <td style={{ color: 'var(--gray-500)', fontSize: 11 }}>{dateStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pos-empty">
              <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u{1F4E6}'}</div>
              No closed trades yet.<br/>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                When you close positions, they'll appear here with their final P&L.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Milestones + Risk Allocation */}
      <div className="perf-bottom">
        <div className="milestone-card">
          <h3>Milestones</h3>
          {stats.milestones.length > 0 ? (
            stats.milestones.map((ms, i) => (
              <div key={i} className="ms-item">
                <div className={'ms-icon ' + (ms.reached ? 'reached' : 'next')}>{ms.icon}</div>
                <div className="ms-info">
                  <h4>{ms.title}</h4>
                  <p>{ms.desc}</p>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              Start trading to unlock milestones
            </div>
          )}
        </div>

        <div className="risk-card">
          <h3>Portfolio Allocation</h3>
          {stats.activeCount > 0 ? (
            <>
              <div className="pie-wrap">
                <svg viewBox="0 0 200 200" width="180" height="180">
                  {pieSegments}
                </svg>
                <div className="pie-center-txt">
                  <div className="pie-big">{stats.activeCount}</div>
                  <div className="pie-small">{'strateg' + (stats.activeCount === 1 ? 'y' : 'ies')}</div>
                </div>
              </div>
              <div className="risk-legend">
                {stats.allocations.map((a, i) => (
                  <div key={i} className="rl-item">
                    <div className="rl-dot" style={{ background: a.color }}></div>
                    {a.name} ({a.pct}%)
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u{1F967}'}</div>
              No active positions to display
            </div>
          )}

          {stats.capitalDeployed > 0 && (
            <div style={{
              marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--gray-100)',
              fontSize: 12, color: 'var(--gray-500)', display: 'flex', justifyContent: 'space-between'
            }}>
              <span>Capital Deployed</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--gray-700)' }}>
                {'$' + stats.capitalDeployed.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Close Confirmation Dialog */}
      {confirmClose && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setConfirmClose(null)}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '24px 28px', maxWidth: 400, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--gray-900)' }}>Close Position?</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.5 }}>
              {'Close '}
              <strong>{confirmClose.symbol + ' ' + formatStrategy(confirmClose.strategy || '')}</strong>
              {' and lock in the current P&L of '}
              <strong style={{ color: (confirmClose.unrealizedPnl || 0) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                {formatPnl((confirmClose.unrealizedPnl || 0) * (confirmClose.quantity || 1))}
              </strong>
              {'?'}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 11, color: 'var(--gray-400)' }}>
              This will move the position to Closed Trades History with today's date.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmClose(null)}
                style={{
                  padding: '8px 16px', fontSize: 13, borderRadius: 8,
                  border: '1px solid var(--gray-200)', background: 'white', color: 'var(--gray-600)',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleClosePosition(confirmClose)}
                disabled={closingId === confirmClose.id}
                style={{
                  padding: '8px 16px', fontSize: 13, borderRadius: 8,
                  border: 'none', background: '#dc2626', color: 'white',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                {closingId === confirmClose.id ? 'Closing...' : 'Close Position'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

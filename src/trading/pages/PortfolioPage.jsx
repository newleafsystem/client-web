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

export function PortfolioPage({ tiles }) {
  const navigate = useNavigate();
  const { portfolioItems, loading, updateStatus, removeFromPortfolio, updateQuantity } = usePortfolio();
  const { settings, updateSettings, loading: settingsLoading, needsOnboarding } = usePortfolioSettings();

  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewTab, setViewTab] = useState('positions');
  const [editingCapital, setEditingCapital] = useState(false);
  const [capitalInput, setCapitalInput] = useState('');
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Safe settings fallback for when settings haven't loaded yet (first-time user)
  const safeSettings = settings || { totalCapital: 0, riskTolerance: 'moderate', maxAllocation: 0.30 };

  // Only show onboarding after a deliberate delay to prevent flash
  useEffect(() => {
    if (!settingsLoading && needsOnboarding && !onboardingDone) {
      // Small delay so the page renders first, then overlay appears
      const timer = setTimeout(() => setShowOnboarding(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowOnboarding(false);
    }
  }, [settingsLoading, needsOnboarding, onboardingDone]);

  // Debounce timer for contract quantity changes
  const quantityTimeoutRef = useRef({});

  // Helper function to calculate capital required based on strategy
  const getCapitalRequired = useCallback((tile, quantity = 1) => {
    const strategy = (tile.strategy || '').toLowerCase();

    // Use calculated metrics from optionsCalc utility
    const metrics = calculateMetrics(tile);
    const calculatedMaxLoss = metrics.maxLoss;

    // For covered calls, calculate risk as (stock price - put strike) * 100
    if (strategy.includes('covered') && strategy.includes('call')) {
      const legs = tile.legs || [];
      const putLeg = legs.find(l => l.type === 'put' && l.action === 'buy');
      const currentPrice = tile.currentPrice || tile.underlyingPrice || getUnderlyingPrice(tile);

      if (putLeg && currentPrice) {
        // Risk = downside from current price to put strike
        const risk = (currentPrice - putLeg.strike) * 100 * quantity;
        return Math.max(risk, 0); // Ensure non-negative
      }

      // Fallback: if maxLoss seems unreasonably large (> 50% of stock price), cap it
      const maxLoss = tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss;
      const reasonableMaxLoss = currentPrice * 100 * 0.25; // Cap at 25% of stock value
      return Math.min(maxLoss, reasonableMaxLoss) * quantity;
    }

    // For other strategies, use calculated maxLoss or tile properties as fallback
    const entryCost = tile.lottery?.ticketCost || tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss;
    return entryCost * quantity;
  }, []);

  // Helper function to get max loss based on strategy
  const getMaxLoss = useCallback((tile, quantity = 1) => {
    const strategy = (tile.strategy || '').toLowerCase();
    const metrics = calculateMetrics(tile);
    const calculatedMaxLoss = metrics.maxLoss;

    // For covered calls, use same logic as capital required
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

    // For other strategies, use calculated maxLoss with tile properties as fallback
    return (tile.technical?.maxLoss || tile.maxLoss || calculatedMaxLoss) * quantity;
  }, []);

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setOnboardingDone(true);
  };

  // Handle quantity change with debouncing
  const handleQuantityChange = useCallback((tileId, newQuantity) => {
    // Clear existing timeout for this tile
    if (quantityTimeoutRef.current[tileId]) {
      clearTimeout(quantityTimeoutRef.current[tileId]);
    }

    // Set new timeout to save after 500ms
    quantityTimeoutRef.current[tileId] = setTimeout(async () => {
      try {
        await updateQuantity(tileId, newQuantity);
      } catch (err) {
        console.error('Failed to update quantity:', err);
      }
    }, 500);
  }, [updateQuantity]);

  // Handle capital edit
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

  // Join portfolio items with tile data
  const portfolioWithTiles = useMemo(() => {
    return portfolioItems.map(portfolioItem => {
      const tile = tiles.find(t => t.id === portfolioItem.tileId);
      return {
        ...portfolioItem,
        tile: tile || {}
      };
    }).filter(item => item.tile.id); // Filter out items where tile wasn't found
  }, [portfolioItems, tiles]);

  // Filter by status
  const filteredPortfolio = useMemo(() => {
    if (statusFilter === 'all') return portfolioWithTiles;
    return portfolioWithTiles.filter(item => item.status === statusFilter);
  }, [portfolioWithTiles, statusFilter]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalPositions = portfolioWithTiles.length;
    const totalCapital = settings?.totalCapital || 0;

    let totalInvested = 0;
    let totalMaxRisk = 0;
    let totalMarginRequired = 0;
    let totalPotentialReturn = 0;

    portfolioWithTiles.forEach(item => {
      const quantity = item.quantity || 1;
      const metrics = calculateMetrics(item.tile);
      const entryCost = getCapitalRequired(item.tile, quantity);
      const maxLoss = getMaxLoss(item.tile, quantity);
      const margin = item.tile.technical?.marginRequired || 0;
      const maxWin = item.tile.maxProfit ?? item.tile.lottery?.maxWin ?? item.tile.technical?.maxProfit ?? metrics.maxProfit;

      totalInvested += entryCost;
      totalMaxRisk += maxLoss;
      totalMarginRequired += margin * quantity;
      totalPotentialReturn += maxWin * quantity;
    });

    const cashAvailable = totalCapital - totalInvested;
    const allocationPct = totalCapital > 0 ? (totalInvested / totalCapital) * 100 : 0;
    const maxAllocation = (settings?.maxAllocation || 0.30) * 100;

    const avgWinRate = portfolioWithTiles.length > 0
      ? portfolioWithTiles.reduce((sum, item) => {
          const odds = item.tile.lottery?.oddsOfProfit || item.tile.technical?.probability || 0;
          return sum + odds;
        }, 0) / portfolioWithTiles.length
      : 0;

    return {
      totalPositions,
      totalCapital,
      totalInvested,
      cashAvailable,
      totalMarginRequired,
      totalMaxRisk,
      totalPotentialReturn,
      allocationPct,
      maxAllocation,
      avgWinRate,
      isOverAllocated: allocationPct > maxAllocation
    };
  }, [portfolioWithTiles, settings]);

  // Status counts for badges
  const statusCounts = useMemo(() => {
    return {
      all: portfolioWithTiles.length,
      watching: portfolioWithTiles.filter(item => item.status === 'watching').length,
      entered: portfolioWithTiles.filter(item => item.status === 'entered').length,
      closed: portfolioWithTiles.filter(item => item.status === 'closed').length
    };
  }, [portfolioWithTiles]);

  // Allocation data for donut chart (by strategy)
  const allocationData = useMemo(() => {
    const byStrategy = {};
    portfolioWithTiles.forEach(item => {
      const strategy = item.strategy || 'Unknown';
      const quantity = item.quantity || 1;
      const invested = getCapitalRequired(item.tile, quantity);

      if (!byStrategy[strategy]) {
        byStrategy[strategy] = { name: strategy, value: 0, count: 0 };
      }
      byStrategy[strategy].value += invested;
      byStrategy[strategy].count += 1;
    });

    return Object.values(byStrategy);
  }, [portfolioWithTiles, getCapitalRequired]);

  // Strategy breakdown for risk view
  const strategyBreakdown = useMemo(() => {
    const byStrategy = {};
    portfolioWithTiles.forEach(item => {
      const strategy = item.strategy || 'Unknown';
      const quantity = item.quantity || 1;
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
  }, [portfolioWithTiles, getMaxLoss]);

  // Scenario analysis
  const scenarioAnalysis = useMemo(() => {
    let bullCase = 0;
    let flatCase = 0;
    let bearCase = 0;

    portfolioWithTiles.forEach(item => {
      const quantity = item.quantity || 1;
      const metrics = calculateMetrics(item.tile);
      const maxProfit = (item.tile.maxProfit ?? item.tile.technical?.maxProfit ?? metrics.maxProfit) * quantity;
      const maxLoss = getMaxLoss(item.tile, quantity);
      const strategy = item.strategy?.toLowerCase() || '';

      // Simplified scenario modeling
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
        // Default neutral
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
  }, [portfolioWithTiles, getMaxLoss]);

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

  return (
    <>
    {/* Onboarding overlay — renders ON TOP of portfolio, not as replacement */}
    {showOnboarding && (
      <OnboardingModal onComplete={handleOnboardingComplete} />
    )}

    <div className="portfolio-container">
      {/* Capital Bar */}
      <div className="capital-bar">
        <div className="capital-main">
          <div className="capital-amount-section">
            <span className="capital-label">Total Capital</span>
            {editingCapital ? (
              <div className="capital-edit-wrapper">
                <span className="capital-dollar">$</span>
                <input
                  type="text"
                  className="capital-edit-input"
                  value={capitalInput}
                  onChange={(e) => setCapitalInput(e.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
                  onBlur={handleCapitalEdit}
                  autoFocus
                />
              </div>
            ) : (
              <div className="capital-amount-display" onClick={() => setEditingCapital(true)}>
                <span className="capital-value">${safeSettings.totalCapital.toLocaleString('en-US')}</span>
                <Edit2 size={16} className="capital-edit-icon" />
              </div>
            )}
          </div>
          <div className={`risk-tolerance-badge ${safeSettings.riskTolerance}`}>
            {safeSettings.riskTolerance === 'conservative' && 'Conservative'}
            {safeSettings.riskTolerance === 'moderate' && 'Moderate'}
            {safeSettings.riskTolerance === 'aggressive' && 'Aggressive'}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="capital-summary-cards">
          <div className="capital-card">
            <div className="capital-card-label">Invested</div>
            <div className="capital-card-value invested">${stats.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
          <div className="capital-card">
            <div className="capital-card-label">Cash</div>
            <div className={`capital-card-value ${stats.cashAvailable < 0 ? 'negative' : 'cash'}`}>
              ${Math.abs(stats.cashAvailable).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="capital-card">
            <div className="capital-card-label">Margin Required</div>
            <div className="capital-card-value margin">${stats.totalMarginRequired.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
          <div className="capital-card">
            <div className="capital-card-label">Max Risk</div>
            <div className="capital-card-value risk">${stats.totalMaxRisk.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        {/* Allocation Bar */}
        <div className="allocation-bar-wrapper">
          <div className="allocation-bar-header">
            <span className="allocation-label">Capital Allocated</span>
            <span className="allocation-percentage">{stats.allocationPct.toFixed(1)}% of {stats.maxAllocation.toFixed(0)}% max</span>
          </div>
          <div className="allocation-bar-track">
            <div
              className={`allocation-bar-fill ${stats.isOverAllocated ? 'over' : ''}`}
              style={{ width: `${Math.min(stats.allocationPct, 100)}%` }}
            ></div>
            <div
              className="allocation-threshold-marker"
              style={{ left: `${stats.maxAllocation}%` }}
            ></div>
          </div>
          {stats.isOverAllocated && (
            <div className="allocation-warning">
              ⚠️ Allocation exceeds your {safeSettings.riskTolerance} risk profile limit
            </div>
          )}
        </div>
      </div>

      {portfolioWithTiles.length === 0 ? (
        /* Empty State */
        <div className="portfolio-empty">
          <svg width="64" height="64" viewBox="0 0 40 40" fill="none">
            <path
              d="M20 4C12 4 6 12 6 20C6 28 10 36 20 36C30 36 34 28 34 20C34 12 28 4 20 4Z"
              fill="#bbf7d0"
              opacity="0.5"
            />
            <path
              d="M20 8C14 8 10 14 10 20C10 26 13 32 20 32C27 32 30 26 30 20C30 14 26 8 20 8Z"
              fill="#86efac"
              opacity="0.7"
            />
            <path
              d="M20 12C16 12 14 16 14 20C14 24 16.5 28 20 28C23.5 28 26 24 26 20C26 16 24 12 20 12Z"
              fill="#22c55e"
            />
            <path
              d="M18 16C17 18 17 22 18 24C19 26 21 26 22 24C23 22 23 18 22 16C21 14 19 14 18 16Z"
              fill="#15803d"
            />
          </svg>
          <h2 className="empty-title">Your portfolio is empty</h2>
          <p className="empty-message">
            Browse opportunities and tap the bookmark icon to start building your portfolio
          </p>
          <button className="btn-primary" onClick={() => navigate('/invest')}>
            Discover Opportunities
          </button>
        </div>
      ) : (
        <>
          {/* View Tabs */}
          <div className="portfolio-view-tabs">
            <button
              className={`view-tab ${viewTab === 'positions' ? 'active' : ''}`}
              onClick={() => setViewTab('positions')}
            >
              Positions
              <span className="tab-badge">{stats.totalPositions}</span>
            </button>
            <button
              className={`view-tab ${viewTab === 'allocation' ? 'active' : ''}`}
              onClick={() => setViewTab('allocation')}
            >
              Allocation
            </button>
            <button
              className={`view-tab ${viewTab === 'risk' ? 'active' : ''}`}
              onClick={() => setViewTab('risk')}
            >
              Risk Summary
            </button>
          </div>

          {/* Positions View */}
          {viewTab === 'positions' && (
            <>
              {/* Status Filter Tabs */}
              <div className="status-filter-tabs">
                <button
                  className={`status-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  All {statusCounts.all > 0 && `(${statusCounts.all})`}
                </button>
                <button
                  className={`status-filter-btn ${statusFilter === 'watching' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('watching')}
                >
                  <span className="status-dot watching"></span>
                  Watching {statusCounts.watching > 0 && `(${statusCounts.watching})`}
                </button>
                <button
                  className={`status-filter-btn ${statusFilter === 'entered' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('entered')}
                >
                  <span className="status-dot entered"></span>
                  Entered {statusCounts.entered > 0 && `(${statusCounts.entered})`}
                </button>
                <button
                  className={`status-filter-btn ${statusFilter === 'closed' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('closed')}
                >
                  <span className="status-dot closed"></span>
                  Closed {statusCounts.closed > 0 && `(${statusCounts.closed})`}
                </button>
              </div>

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
                  {/* Card Header */}
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

                  {/* Added Date */}
                  <div className="pf-card-added">
                    <span className="pf-added-label">ADDED</span>
                    <span className="pf-added-time">{formatRelativeTime(item.addedAt)}</span>
                  </div>

                  {/* Contract Controls */}
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

                  {/* Stats Grid */}
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
                      <div className="pf-stat-value">{winRate.toFixed(0)}%</div>
                    </div>
                    <div className="pf-stat">
                      <div className="pf-stat-label">Days Left</div>
                      <div className={`pf-stat-value ${daysColor}`}>{daysLeft}d</div>
                    </div>
                  </div>

                  {/* Probability Bar */}
                  {winRate > 0 && (
                    <div className="pf-prob-bar">
                      <div className="pf-prob-track">
                        <div className="pf-prob-fill" style={{ width: `${winRate}%` }}></div>
                      </div>
                      <div className="pf-prob-labels">
                        <span className="pf-prob-risk">{(100 - winRate).toFixed(0)}% risk</span>
                        <span className="pf-prob-success">{winRate.toFixed(0)}% probability</span>
                      </div>
                    </div>
                  )}

                  {/* Card Footer */}
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
          )}

          {/* Allocation View */}
          {viewTab === 'allocation' && (
            <div className="allocation-view">
              <div className="allocation-charts">
                {/* Donut Chart */}
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
                          {allocationData.map((entry, index) => {
                            return <Cell key={`cell-${index}`} fill={getChartColor(entry.name)} />;
                          })}
                        </Pie>
                        <Tooltip
                          formatter={(value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        />
                        <Legend
                          iconType="circle"
                          formatter={(value, entry) => {
                            return <span style={{ color: '#374151' }}>{formatStrategy(value)}</span>;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="empty-chart-message">No allocation data available</p>
                  )}
                </div>

                {/* Allocation Table */}
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
                            <td>{percentage.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Risk Summary View */}
          {viewTab === 'risk' && (
            <div className="risk-view">
              {/* Risk Gauges */}
              <div className="risk-gauges">
                <div className="risk-gauge-card">
                  <h4 className="gauge-title">Portfolio Risk Score</h4>
                  <div className="gauge-value-large">
                    {((stats.totalMaxRisk / stats.totalCapital) * 100).toFixed(1)}%
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
                  <div className="gauge-value-large">{stats.avgWinRate.toFixed(1)}%</div>
                  <div className="gauge-label">probability of profit</div>
                  <div className="gauge-bar">
                    <div
                      className="gauge-fill normal"
                      style={{ width: `${stats.avgWinRate}%` }}
                    ></div>
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

              {/* Strategy Risk Breakdown */}
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

              {/* Scenario Analysis */}
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

      {/* Confirm Delete Dialog */}
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
    </div>
    </>
  );
}

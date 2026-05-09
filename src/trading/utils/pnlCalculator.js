/**
 * pnlCalculator.js — Central P&L calculation for portfolio positions
 *
 * Three-tier pricing:
 *   Tier 1: R2 option chain match (exact mid-price from latest scan)
 *   Tier 2: Black-Scholes estimate (from current spot + entry IV)
 *   Tier 3: Intrinsic value at expiry (fallback)
 */

import { matchOptionLeg } from '../api/r2Api';

// ── Black-Scholes option pricing ─────────────────────────────────────────────

function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Estimate an option's fair value using Black-Scholes.
 * @param {number} spot — current underlying price
 * @param {number} strike
 * @param {string|Date} expiry — expiration date
 * @param {number} iv — implied volatility (decimal, e.g. 0.35)
 * @param {string} type — 'call' or 'put'
 * @param {number} r — risk-free rate (default 4.5%)
 * @returns {number} estimated option price per share
 */
export function bsPrice(spot, strike, expiry, iv, type, r = 0.045) {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry + 'T16:00:00') : expiry;
  const T = Math.max((expiryDate - new Date()) / (365.25 * 86400000), 0.001);

  const d1 = (Math.log(spot / strike) + (r + iv * iv / 2) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);

  if (type === 'call') {
    return spot * normCDF(d1) - strike * Math.exp(-r * T) * normCDF(d2);
  }
  return strike * Math.exp(-r * T) * normCDF(-d2) - spot * normCDF(-d1);
}

function normPDF(x) {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculate BS Greeks for a single option leg.
 */
export function bsGreeks(spot, strike, expiry, iv, type, r = 0.045) {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry + 'T16:00:00') : expiry;
  const T = Math.max((expiryDate - new Date()) / (365.25 * 86400000), 0.001);

  const d1 = (Math.log(spot / strike) + (r + iv * iv / 2) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);

  const isCall = type === 'call';
  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = normPDF(d1) / (spot * iv * Math.sqrt(T));
  const vega = spot * normPDF(d1) * Math.sqrt(T) / 100;
  const theta = isCall
    ? (-spot * normPDF(d1) * iv / (2 * Math.sqrt(T)) - r * strike * Math.exp(-r * T) * normCDF(d2)) / 365
    : (-spot * normPDF(d1) * iv / (2 * Math.sqrt(T)) + r * strike * Math.exp(-r * T) * normCDF(-d2)) / 365;

  return { delta: +delta.toFixed(4), gamma: +gamma.toFixed(4), theta: +theta.toFixed(4), vega: +vega.toFixed(4) };
}

/**
 * Calculate net Greeks for a multi-leg position using current spot + remaining DTE.
 */
export function recalculateGreeks(legs, currentSpot, expiry) {
  let netDelta = 0, netGamma = 0, netTheta = 0, netVega = 0;
  const legGreeks = [];

  for (const leg of legs) {
    const type = (leg.type || '').toLowerCase();
    const action = (leg.action || '').toLowerCase();
    const iv = leg.entryIv || leg.iv || 0.3;
    const legExpiry = leg.expiry || expiry;
    const mult = action === 'sell' ? -1 : 1;

    if (!legExpiry || !leg.strike) {
      legGreeks.push({ delta: 0, gamma: 0, theta: 0, vega: 0 });
      continue;
    }

    const g = bsGreeks(currentSpot, leg.strike, legExpiry, iv, type);
    netDelta += g.delta * mult;
    netGamma += g.gamma * mult;
    netTheta += g.theta * mult;
    netVega += g.vega * mult;
    legGreeks.push({ delta: +(g.delta * mult).toFixed(4), gamma: +(g.gamma * mult).toFixed(4), theta: +(g.theta * mult).toFixed(4), vega: +(g.vega * mult).toFixed(4) });
  }

  return {
    net: { delta: +netDelta.toFixed(4), gamma: +netGamma.toFixed(4), theta: +netTheta.toFixed(4), vega: +netVega.toFixed(4) },
    perLeg: legGreeks,
  };
}

/**
 * Calculate P&L at a given spot price (for risk scenarios).
 */
export function pnlAtPrice(legs, spotPrice) {
  let pnl = 0;
  for (const leg of legs) {
    const type = (leg.type || '').toLowerCase();
    const isSell = (leg.action || '').toLowerCase() === 'sell';
    const premium = leg.entryPremium || leg.premium || 0;
    const intrinsic = type === 'call' ? Math.max(0, spotPrice - leg.strike) : Math.max(0, leg.strike - spotPrice);
    pnl += isSell ? (premium - intrinsic) * 100 : (intrinsic - premium) * 100;
  }
  return Math.round(pnl * 100) / 100;
}

/**
 * Intrinsic value (payoff at expiry).
 */
function intrinsicValue(spot, strike, type) {
  if (type === 'call') return Math.max(0, spot - strike);
  return Math.max(0, strike - spot);
}

// ── Position P&L calculator ──────────────────────────────────────────────────

/**
 * Calculate unrealized P&L for a portfolio position.
 *
 * @param {Object} item — portfolio item with legs[], entryNetCredit, tile
 * @param {number} currentSpot — current underlying price
 * @param {Array} [r2Chain] — optional R2 option chain for Tier 1 matching
 * @returns {{ unrealizedPnl, currentNetValue, entryNetCredit, method, legDetails[] }}
 */
export function calculatePositionPnl(item, currentSpot, r2Chain = null) {
  const legs = item.legs || item.tile?.legs || [];
  const entryNetCredit = item.entryNetCredit || 0;
  const expiry = item.expiry || item.tile?.expiry || null;

  if (legs.length === 0 || !currentSpot) {
    return { unrealizedPnl: 0, currentNetValue: 0, entryNetCredit, method: 'none', legDetails: [] };
  }

  let method = 'intrinsic';
  let hasR2 = false;
  let hasBS = false;

  const legDetails = legs.map(leg => {
    const strike = leg.strike;
    const type = (leg.type || '').toLowerCase();
    const action = (leg.action || '').toLowerCase();
    const legExpiry = leg.expiry || expiry;
    const entryPremium = leg.entryPremium || leg.premium || 0;
    const iv = leg.entryIv || leg.iv || null;

    let currentPremium = null;
    let legMethod = 'intrinsic';

    // Tier 1: R2 option chain match — MUST match expiry exactly
    if (r2Chain && legExpiry) {
      const r2Price = matchOptionLeg(r2Chain, strike, legExpiry, type);
      if (r2Price != null && r2Price > 0) {
        currentPremium = r2Price;
        legMethod = 'r2_match';
        hasR2 = true;
      }
    }

    // Tier 2: Black-Scholes estimate
    if (currentPremium == null && iv && iv > 0 && legExpiry) {
      try {
        currentPremium = bsPrice(currentSpot, strike, legExpiry, iv, type);
        legMethod = 'black_scholes';
        hasBS = true;
      } catch (e) {
        // BS failed, fall through to intrinsic
      }
    }

    // Tier 3: Intrinsic value
    if (currentPremium == null) {
      currentPremium = intrinsicValue(currentSpot, strike, type);
      legMethod = 'intrinsic';
    }

    // P&L per leg (per contract = ×100)
    const mult = action === 'sell' ? -1 : 1;
    const legPnl = (currentPremium - entryPremium) * mult * 100;

    return {
      strike, type, action, entryPremium, currentPremium,
      legPnl, method: legMethod,
    };
  });

  // Overall method is the worst tier used
  if (hasR2 && !hasBS && legDetails.every(l => l.method === 'r2_match')) {
    method = 'r2_match';
  } else if (hasR2 || hasBS) {
    method = 'estimated';
  }

  const currentNetValue = legDetails.reduce((sum, l) => sum + l.legPnl, 0);
  let unrealizedPnl = currentNetValue;

  // Safety cap: for defined-risk strategies, P&L per contract can't exceed max loss
  const maxLoss = item.tile?.maxLoss || item.maxLoss;
  if (maxLoss && unrealizedPnl < -Math.abs(maxLoss)) {
    unrealizedPnl = -Math.abs(maxLoss);
  }

  return { unrealizedPnl, currentNetValue, entryNetCredit, method, legDetails };
}

// ── Strategy status engine ───────────────────────────────────────────────────

/**
 * Determine the health status of a position and suggest actions.
 *
 * @param {Object} item — portfolio item
 * @param {number} currentSpot — current underlying price
 * @param {Object} pnlResult — output from calculatePositionPnl
 * @returns {{ status, statusColor, suggestion, urgency, details }}
 */
export function getStrategyStatus(item, currentSpot, pnlResult) {
  const legs = item.legs || item.tile?.legs || [];
  const expiry = item.expiry || item.tile?.expiry || null;
  const strategy = (item.strategy || item.tile?.strategy || '').toLowerCase();
  const entryCredit = Math.abs(item.entryNetCredit || 0);
  const pnl = pnlResult.unrealizedPnl;
  const pnlPct = entryCredit > 0 ? (pnl / (entryCredit * 100)) * 100 : 0;

  // Days to expiry
  const dte = expiry ? Math.max(0, Math.round((new Date(expiry + 'T16:00:00') - new Date()) / 86400000)) : null;

  // Find key strikes
  const shortPut = legs.find(l => l.action === 'sell' && l.type?.toLowerCase() === 'put');
  const shortCall = legs.find(l => l.action === 'sell' && l.type?.toLowerCase() === 'call');
  const longPut = legs.find(l => l.action === 'buy' && l.type?.toLowerCase() === 'put');
  const longCall = legs.find(l => l.action === 'buy' && l.type?.toLowerCase() === 'call');

  // Position relative to strikes
  let zone = 'profit_zone';
  let breachedLeg = null;

  if (shortPut && currentSpot < shortPut.strike) {
    zone = currentSpot < (longPut?.strike || 0) ? 'max_loss_put' : 'breached_put';
    breachedLeg = 'short put';
  } else if (shortCall && currentSpot > shortCall.strike) {
    zone = currentSpot > (longCall?.strike || Infinity) ? 'max_loss_call' : 'breached_call';
    breachedLeg = 'short call';
  }

  // Determine status and suggestion
  let status, statusColor, suggestion, urgency;

  // Expired
  if (dte === 0) {
    if (zone === 'profit_zone') {
      return { status: 'Expiring Profitable', statusColor: '#1D9E75', suggestion: 'Let expire worthless — collect full credit.', urgency: 'low', details: { zone, dte, pnlPct, breachedLeg } };
    }
    return { status: 'Expiring at Loss', statusColor: '#E24B4A', suggestion: 'Close immediately to avoid assignment risk.', urgency: 'critical', details: { zone, dte, pnlPct, breachedLeg } };
  }

  // Max loss zone
  if (zone === 'max_loss_put' || zone === 'max_loss_call') {
    status = 'Max Loss';
    statusColor = '#E24B4A';
    suggestion = `Close to limit damage. ${breachedLeg} breached and past long strike. Consider rolling to next cycle.`;
    urgency = 'critical';
  }
  // Breached short strike
  else if (zone === 'breached_put' || zone === 'breached_call') {
    status = 'Breached';
    statusColor = '#E24B4A';
    if (dte <= 5) {
      suggestion = `Close or roll — ${breachedLeg} at $${(breachedLeg === 'short put' ? shortPut : shortCall)?.strike} breached with only ${dte}d left.`;
      urgency = 'critical';
    } else {
      suggestion = `Monitor closely — stock has breached ${breachedLeg}. Consider rolling the tested side out in time.`;
      urgency = 'high';
    }
  }
  // Profit zone — check if ready to take profit
  else if (pnlPct >= 50 && entryCredit > 0) {
    status = 'Take Profit';
    statusColor = '#1D9E75';
    suggestion = `Consider closing — captured ${Math.round(pnlPct)}% of max profit. Close early to free capital and reduce risk.`;
    urgency = 'low';
  }
  // Near expiry in profit zone
  else if (dte !== null && dte <= 7 && zone === 'profit_zone') {
    status = 'Theta Harvesting';
    statusColor = '#C9A96E';
    suggestion = `${dte}d to expiry in profit zone. Theta is accelerating — hold if comfortable, close if near target.`;
    urgency = 'medium';
  }
  // Healthy
  else {
    status = 'Healthy';
    statusColor = '#1D9E75';
    const distToPut = shortPut ? ((currentSpot - shortPut.strike) / currentSpot * 100).toFixed(1) : null;
    const distToCall = shortCall ? ((shortCall.strike - currentSpot) / currentSpot * 100).toFixed(1) : null;
    const buffer = [];
    if (distToPut) buffer.push(`${distToPut}% above put`);
    if (distToCall) buffer.push(`${distToCall}% below call`);
    suggestion = buffer.length ? `Position healthy — ${buffer.join(', ')}. No action needed.` : 'Position healthy. No action needed.';
    urgency = 'none';
  }

  return { status, statusColor, suggestion, urgency, details: { zone, dte, pnlPct: Math.round(pnlPct), breachedLeg } };
}

const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || 'https://api.newleafsystem.com/api/v1'
).replace(/\/+$/, '');

export async function fetchLatestRecommendationBatch() {
  const response = await fetch(`${API_BASE_URL}/public/recommendations/latest`, {
    headers: {
      Accept: 'application/json',
    },
  });
  const data = await response.json().catch(() => null);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Unable to load recommendations (${response.status})`);
  }
  return normalizeRecommendationBatch(data?.recommendationBatch);
}

export function recommendationBatchToWeek(batch) {
  if (!batch) return null;
  return {
    id: batch.weekId || batch.recommendationBatchId || batch.id,
    weekId: batch.weekId || batch.tradeDate || batch.id,
    recommendationBatchId: batch.recommendationBatchId || batch.id,
    title: batch.title || 'Daily Picks',
    theme: batch.theme || '',
    dateRange: batch.dateRange || batch.tradeDate || '',
    tradeDate: batch.tradeDate || '',
    status: batch.status || 'published',
    publishedAt: batch.publishedAt || null,
    picks: batch.recommendations || batch.picks || [],
  };
}

export function recommendationBatchToTiles(batch) {
  return (batch?.recommendations || batch?.picks || []).map((item, index) => ({
    ...item,
    id: item.tileId || item.id || `${item.symbol}-${index + 1}`,
    tileId: item.tileId || item.id || `${item.symbol}-${index + 1}`,
    isActive: true,
    source: 'recommendation-batch',
    recommendationBatchId: batch.recommendationBatchId || batch.id,
    sortOrder: Number(item.sortOrder ?? (index + 1) * 10),
    underlyingPrice: item.price ?? item.underlyingPrice ?? null,
    probabilityOfProfit: item.oddsOfProfit ?? item.probabilityOfProfit ?? null,
    probOfProfit: item.oddsOfProfit ?? item.probOfProfit ?? null,
    technical: {
      ...(item.technical || {}),
      probability: item.oddsOfProfit != null ? Number(item.oddsOfProfit) / 100 : item.technical?.probability,
      maxProfit: item.maxProfit ?? item.technical?.maxProfit,
    },
  }));
}

function normalizeRecommendationBatch(batch) {
  if (!batch) return null;
  const recommendations = Array.isArray(batch.recommendations)
    ? batch.recommendations.map(normalizeRecommendationItem)
    : Array.isArray(batch.picks)
      ? batch.picks.map(normalizeRecommendationItem)
      : [];
  return {
    id: batch.id || batch.recommendationBatchId || '',
    recommendationBatchId: batch.recommendationBatchId || batch.id || '',
    tradeDate: batch.tradeDate || '',
    weekId: batch.weekId || batch.tradeDate || '',
    title: batch.title || 'Daily Picks',
    theme: batch.theme || '',
    dateRange: batch.dateRange || batch.tradeDate || '',
    status: batch.status || 'published',
    publishedAt: batch.publishedAt || null,
    recommendations,
    picks: recommendations,
  };
}

function normalizeRecommendationItem(item = {}) {
  const symbol = String(item.symbol || '').toUpperCase();
  return {
    ...item,
    id: item.id || item.tileId || symbol,
    tileId: item.tileId || item.id || symbol,
    symbol,
    strategy: item.strategy || '',
    direction: item.direction || 'NEUTRAL',
    price: numericOrNull(item.price ?? item.underlyingPrice),
    expiry: item.expiry || '',
    rewardRisk: numericOrNull(item.rewardRisk),
    oddsOfProfit: numericOrNull(item.oddsOfProfit ?? item.probabilityOfProfit),
    maxProfit: numericOrNull(item.maxProfit),
    thesis: item.thesis || '',
    riskNotes: item.riskNotes || item.risk || '',
    sortOrder: Number(item.sortOrder || 0),
  };
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

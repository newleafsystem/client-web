/**
 * analysisApi.js
 *
 * Fetches analysis data through the shared NewLeaf API facade.
 * Browser code must not call object-storage provider origins directly.
 */

import { fetchR2Report, transformToGammaData, transformToTechnicalData } from './r2Api';

/**
 * Fetch gamma wall analysis from the market-data report.
 * Returns the envelope shape that AnalysisPage.jsx expects.
 */
export async function fetchGammaWall(ticker) {
  const r2 = await fetchR2Report(ticker);
  const gammaData = transformToGammaData(r2);

  return {
    spot: gammaData.spot,
    ticker: gammaData.ticker,
    analysis: gammaData,
    condorGate: gammaData.condorGate,
    earnings: gammaData.earnings_check,
    optionChain: r2.optionChain || [],
    timestamp: r2.meta?.generatedAt || new Date().toISOString(),
    dataSource: 'r2',
    dataDelay: null,
  };
}

/**
 * Fetch technical analysis from the market-data report.
 */
export async function fetchTechnicalAnalysis(ticker) {
  const r2 = await fetchR2Report(ticker);
  return transformToTechnicalData(r2);
}

/**
 * Fetch full analysis (gamma + technical combined) from the market-data report.
 */
export async function fetchFullAnalysis(ticker) {
  const r2 = await fetchR2Report(ticker);
  return {
    gamma: transformToGammaData(r2),
    technical: transformToTechnicalData(r2),
  };
}

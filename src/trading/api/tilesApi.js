/**
 * tilesApi.js
 *
 * API client for tile generation tasks
 */

import axios from 'axios';

const API_BASE_URL = `${String(
  import.meta.env.VITE_API_BASE_URL || 'https://api.newleafsystem.com/api/v1'
).replace(/\/+$/, '')}/tiles`;

/**
 * Create a tile generation task
 * @param {string} symbol - Stock symbol
 * @param {string} direction - bullish|neutral|bearish
 * @param {Object} options - Optional parameters {strategy, expiry, dteMin, dteMax}
 * @returns {Promise<{taskId: string, status: string}>}
 */
export async function createTileTask(symbol, direction, options = {}) {
  const response = await axios.post(`${API_BASE_URL}/create`, {
    symbol,
    direction,
    ...options
  });
  return response.data;
}

/**
 * Get task status
 * @param {string} taskId - Task ID
 * @returns {Promise<Object>} Task object with status, log, etc.
 */
export async function getTaskStatus(taskId) {
  const response = await axios.get(`${API_BASE_URL}/task/${taskId}`);
  return response.data;
}

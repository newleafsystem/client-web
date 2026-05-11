const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || 'https://api.newleafsystem.com/api/v1'
).replace(/\/+$/, '');

export function publicDataUrl(path) {
  return `${API_BASE_URL}/public/data/${normalizePublicAssetPath(path)}`;
}

export function publicMediaUrl(path) {
  return `${API_BASE_URL}/public/media/${normalizePublicAssetPath(path)}`;
}

function normalizePublicAssetPath(path) {
  const normalized = String(path ?? '').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\\')) {
    throw new Error('Invalid public asset path');
  }
  return normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

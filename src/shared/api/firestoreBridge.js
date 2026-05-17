const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || 'https://api.newleafsystem.com/api/v1'
).replace(/\/+$/, '');

const SERVER_TIMESTAMP_MARKER = '__newleafServerTimestamp';
const PUBLIC_COLLECTIONS = new Set(['tiles', 'weeklyPicks', 'pick_outcomes']);
const PUBLIC_DOCUMENTS = [
  /^tiles\/[^/]+$/,
  /^weeklyPicks\/[^/]+$/,
  /^pick_outcomes\/[^/]+$/,
  /^analyses\/[^/]+$/,
  /^marketState\/current$/,
  /^config\/alertThresholds$/,
];

export const apiFirestore = Object.freeze({ __newleafApiFirestore: true });

export function collection(root, ...segments) {
  return makeRef('collection', root, segments);
}

export function doc(root, ...segments) {
  return makeRef('document', root, segments);
}

export function query(ref, ...constraints) {
  return {
    ...ref,
    constraints: [...(ref.constraints || []), ...constraints.filter(Boolean)],
  };
}

export function where(field, op, value) {
  return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(value) {
  return { type: 'limit', value };
}

export function serverTimestamp() {
  return { [SERVER_TIMESTAMP_MARKER]: true };
}

export async function getDoc(ref) {
  ensureRef(ref, 'document');
  const response = await firestoreRequest('get', { path: ref.path }, { publicRead: isPublicDocument(ref.path) });
  return createDocumentSnapshot(response.document, ref);
}

export async function getDocs(ref) {
  ensureRef(ref, 'collection');
  const payload = buildQueryPayload(ref);
  const response = await firestoreRequest('query', payload, { publicRead: isPublicCollection(ref.path) });
  return createQuerySnapshot(response.documents || [], ref);
}

export async function setDoc(ref, data, options = {}) {
  ensureRef(ref, 'document');
  const response = await firestoreRequest('set', {
    path: ref.path,
    data,
    merge: options?.merge === true,
  });
  return createDocumentSnapshot(response.document, ref);
}

export async function updateDoc(ref, data) {
  ensureRef(ref, 'document');
  const response = await firestoreRequest('update', { path: ref.path, data });
  return createDocumentSnapshot(response.document, ref);
}

export async function deleteDoc(ref) {
  ensureRef(ref, 'document');
  await firestoreRequest('delete', { path: ref.path });
}

export async function addDoc(ref, data) {
  ensureRef(ref, 'collection');
  const response = await firestoreRequest('add', { collection: ref.path, data });
  return createDocumentSnapshot(response.document, doc(ref, response.document?.id));
}

export function writeBatch() {
  const operations = [];
  return {
    set(ref, data, options = {}) {
      operations.push(() => setDoc(ref, data, options));
    },
    update(ref, data) {
      operations.push(() => updateDoc(ref, data));
    },
    delete(ref) {
      operations.push(() => deleteDoc(ref));
    },
    async commit() {
      for (const operation of operations) {
        await operation();
      }
    },
  };
}

export function onSnapshot(ref, onNext, onError) {
  let cancelled = false;

  Promise.resolve()
    .then(() => (ref.type === 'document' ? getDoc(ref) : getDocs(ref)))
    .then((snapshot) => {
      if (!cancelled) onNext(snapshot);
    })
    .catch((error) => {
      if (!cancelled) onError?.(error);
    });

  return () => {
    cancelled = true;
  };
}

function makeRef(type, root, segments) {
  const basePath = pathFromRoot(root);
  const pathSegments = [...basePath, ...segments].map(normalizeSegment);
  const path = pathSegments.filter(Boolean).join('/');
  if (!path) {
    throw new Error('Firestore path is required');
  }
  return {
    type,
    path,
    id: pathSegments[pathSegments.length - 1],
  };
}

function pathFromRoot(root) {
  if (root?.__newleafApiFirestore) return [];
  if (root?.path) return root.path.split('/').filter(Boolean);
  if (typeof root === 'string') return [root];
  return [];
}

function normalizeSegment(value) {
  const segment = String(value ?? '').trim();
  if (!segment || segment.includes('/') || segment.includes('\\') || segment === '.' || segment === '..') {
    throw new Error('Invalid Firestore path segment');
  }
  return segment;
}

function ensureRef(ref, type) {
  if (!ref || ref.type !== type || !ref.path) {
    throw new Error(`Expected a Firestore ${type} reference`);
  }
}

function buildQueryPayload(ref) {
  const filters = [];
  const order = [];
  let queryLimit = null;

  for (const constraint of ref.constraints || []) {
    if (constraint.type === 'where') {
      filters.push({
        field: constraint.field,
        op: constraint.op,
        value: constraint.value,
      });
    } else if (constraint.type === 'orderBy') {
      order.push({
        field: constraint.field,
        direction: constraint.direction || 'asc',
      });
    } else if (constraint.type === 'limit') {
      queryLimit = constraint.value;
    }
  }

  return {
    collection: ref.path,
    filters,
    orderBy: order,
    limit: queryLimit,
  };
}

async function firestoreRequest(operation, payload, options = {}) {
  const namespace = options.publicRead ? 'public/firestore' : 'firestore';
  const response = await fetch(`${API_BASE_URL}/${namespace}/${operation}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Firestore API request failed (${response.status})`);
  }
  return data || {};
}

function createQuerySnapshot(documents, ref) {
  const docs = documents.map((document) => createDocumentSnapshot(document, doc(ref, document.id)));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach(callback) {
      docs.forEach(callback);
    },
  };
}

function createDocumentSnapshot(document, fallbackRef) {
  const exists = Boolean(document);
  const ref = exists ? {
    type: 'document',
    path: document.path || fallbackRef.path,
    id: document.id || fallbackRef.id,
  } : fallbackRef;

  return {
    id: ref.id,
    ref,
    exists: () => exists,
    data: () => (exists ? { ...(document.data || {}) } : undefined),
  };
}

function isPublicCollection(path) {
  return PUBLIC_COLLECTIONS.has(path);
}

function isPublicDocument(path) {
  return PUBLIC_DOCUMENTS.some((pattern) => pattern.test(path));
}

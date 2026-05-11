'use strict';

const os = require('os');
const { getFirebaseAdmin, getFirestoreDb } = require('../../lib/firebase-admin.cjs');
const { numberEnv } = require('../../lib/env.cjs');

class SchedulerLockError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SchedulerLockError';
    this.details = details;
  }
}

function getSchedulerDb() {
  return {
    admin: getFirebaseAdmin(),
    db: getFirestoreDb()
  };
}

function ownerId() {
  return `${os.hostname()}-${process.pid}`;
}

function lockTtlMs(jobName) {
  const key = `SCHEDULER_${jobName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_LOCK_TTL_MINUTES`;
  const minutes = numberEnv(key, numberEnv('SCHEDULER_LOCK_TTL_MINUTES', 20));
  return Math.max(1, minutes) * 60 * 1000;
}

async function withSchedulerLock(jobName, fn, options = {}) {
  const { admin, db } = getSchedulerDb();
  const ref = db.collection('schedulerLocks').doc(jobName);
  const now = Date.now();
  const ttlMs = options.ttlMs ?? lockTtlMs(jobName);
  const lockedUntilMs = now + ttlMs;
  const owner = ownerId();

  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? snap.data() : {};
    const existingLockedUntilMs = Number(data.lockedUntilMs || 0);

    if (existingLockedUntilMs > now) {
      throw new SchedulerLockError(`Scheduler job is already running: ${jobName}`, {
        jobName,
        lockedUntilMs: existingLockedUntilMs,
        owner: data.owner || ''
      });
    }

    transaction.set(ref, {
      jobName,
      owner,
      status: 'running',
      lockedUntilMs,
      startedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
  });

  try {
    const result = await fn();
    await ref.set({
      status: 'completed',
      lockedUntilMs: 0,
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
    return result;
  } catch (error) {
    await ref.set({
      status: 'failed',
      lockedUntilMs: 0,
      error: String(error.message || error).slice(0, 500),
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
    throw error;
  }
}

function dailyStateRef(db, date) {
  return db.collection('schedulerState').doc(`daily-catchup-${date}`);
}

async function hasDailyStepCompleted(date, step) {
  const { db } = getSchedulerDb();
  const snap = await dailyStateRef(db, date).get();
  const data = snap.exists ? snap.data() : {};
  return data.steps?.[step]?.status === 'completed';
}

async function markDailyStep(date, step, status, extra = {}) {
  const { admin, db } = getSchedulerDb();
  await dailyStateRef(db, date).set({
    date,
    steps: {
      [step]: {
        status,
        updatedAt: admin.firestore.Timestamp.now(),
        ...extra
      }
    },
    updatedAt: admin.firestore.Timestamp.now()
  }, { merge: true });
}

module.exports = {
  SchedulerLockError,
  hasDailyStepCompleted,
  markDailyStep,
  withSchedulerLock
};

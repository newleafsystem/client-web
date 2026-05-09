'use strict';

const fs = require('fs');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { PROJECT_ROOT, loadEnvFile, boolEnv, env, resolveProjectPath } = require('./env.cjs');

function parseServiceAccountJson(value, sourceLabel) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid Firebase credentials JSON in ${sourceLabel}: ${error.message}`);
  }
}

function loadServiceAccount() {
  loadEnvFile();

  const inlineJson = env('FIREBASE_CREDENTIALS_JSON');
  if (inlineJson) return parseServiceAccountJson(inlineJson, 'FIREBASE_CREDENTIALS_JSON');

  const base64Json = env('FIREBASE_CREDENTIALS_BASE64');
  if (base64Json) {
    const decoded = Buffer.from(base64Json, 'base64').toString('utf8');
    return parseServiceAccountJson(decoded, 'FIREBASE_CREDENTIALS_BASE64');
  }

  const credentialsFile = env('FIREBASE_CREDENTIALS_FILE') || env('GOOGLE_APPLICATION_CREDENTIALS');
  if (credentialsFile) {
    const resolved = resolveProjectPath(credentialsFile, PROJECT_ROOT);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Firebase credentials file not found: ${credentialsFile}`);
    }
    return parseServiceAccountJson(fs.readFileSync(resolved, 'utf8'), 'FIREBASE_CREDENTIALS_FILE');
  }

  return null;
}

function initializeFirebaseAdmin(options = {}) {
  loadEnvFile(options);

  if (admin.apps.length) return admin.app();

  const projectId = options.projectId || env('FIREBASE_PROJECT_ID');
  const useApplicationDefault = options.useApplicationDefault ?? boolEnv('FIREBASE_USE_APPLICATION_DEFAULT', false);
  const serviceAccount = useApplicationDefault ? null : loadServiceAccount();

  const appOptions = {};
  if (projectId) appOptions.projectId = projectId;
  appOptions.credential = serviceAccount
    ? admin.credential.cert(serviceAccount)
    : admin.credential.applicationDefault();

  return admin.initializeApp(appOptions);
}

function getFirebaseAdmin(options = {}) {
  initializeFirebaseAdmin(options);
  return admin;
}

function getFirestoreDb(options = {}) {
  const app = initializeFirebaseAdmin(options);
  const databaseId = options.databaseId || env('FIRESTORE_DATABASE_ID', 'newleafdb');
  return databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);
}

module.exports = {
  getFirebaseAdmin,
  getFirestoreDb,
  initializeFirebaseAdmin,
  loadServiceAccount
};

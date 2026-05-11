'use strict';

const {
  loadEnvFile,
  env,
  boolEnv,
  numberEnv,
  listEnv
} = require('./env.cjs');

function loadRuntimeConfig(options = {}) {
  loadEnvFile(options);

  return {
    firebase: {
      projectId: env('FIREBASE_PROJECT_ID'),
      databaseId: env('FIRESTORE_DATABASE_ID', 'newleafdb'),
      useApplicationDefault: boolEnv('FIREBASE_USE_APPLICATION_DEFAULT', false),
      credentialsJson: env('FIREBASE_CREDENTIALS_JSON'),
      credentialsBase64: env('FIREBASE_CREDENTIALS_BASE64'),
      credentialsFile: env('FIREBASE_CREDENTIALS_FILE') || env('GOOGLE_APPLICATION_CREDENTIALS'),
      googleApplicationCredentials: env('GOOGLE_APPLICATION_CREDENTIALS')
    },
    authSession: {
      cookieName: env('AUTH_SESSION_COOKIE_NAME', '__Host-newleaf_session'),
      maxAgeHours: numberEnv('AUTH_SESSION_MAX_AGE_HOURS', 24),
      secure: boolEnv('AUTH_SESSION_SECURE', true),
      sameSite: env('AUTH_SESSION_SAME_SITE', 'Lax'),
      allowedOrigins: listEnv('AUTH_SESSION_ALLOWED_ORIGINS')
    },
    alpaca: {
      apiKey: env('ALPACA_API_KEY'),
      secretKey: env('ALPACA_SECRET_KEY')
    },
    r2: {
      accountId: env('R2_ACCOUNT_ID'),
      bucket: env('R2_BUCKET'),
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
      endpoint: env('R2_ENDPOINT'),
      publicBaseUrl: env('R2_PUBLIC_BASE_URL')
    },
    scheduler: {
      sharedSecret: env('SCHEDULER_SHARED_SECRET'),
      allowUnauthenticated: boolEnv('SCHEDULER_ALLOW_UNAUTHENTICATED', false),
      apiBaseUrl: env('SCHEDULER_API_BASE_URL', 'https://api.newleafsystem.com'),
      lockTtlMinutes: numberEnv('SCHEDULER_LOCK_TTL_MINUTES', 20)
    },
    pipeline: {
      dteMin: numberEnv('PIPELINE_DTE_MIN', 7),
      dteMax: numberEnv('PIPELINE_DTE_MAX', 45),
      concurrency: numberEnv('PIPELINE_CONCURRENCY', 3)
    },
    email: {
      smtp: {
        host: env('SMTP_HOST'),
        port: numberEnv('SMTP_PORT', 587),
        user: env('SMTP_USER'),
        pass: env('SMTP_PASS')
      },
      from: env('EMAIL_FROM'),
      recipients: listEnv('EMAIL_RECIPIENTS')
    },
    watchlist: listEnv('WATCHLIST'),
    sentiment: {
      enabled: boolEnv('SENTIMENT_ENABLED', false),
      cacheMaxAgeMinutes: numberEnv('SENTIMENT_CACHE_MAX_AGE_MINUTES', 60),
      engines: {
        claude: {
          enabled: boolEnv('CLAUDE_SENTIMENT_ENABLED', false),
          weight: numberEnv('CLAUDE_SENTIMENT_WEIGHT', 0)
        },
        grok: {
          enabled: boolEnv('GROK_SENTIMENT_ENABLED', false),
          weight: numberEnv('GROK_SENTIMENT_WEIGHT', 0),
          apiKey: env('XAI_API_KEY')
        },
        gemini: {
          enabled: boolEnv('GEMINI_SENTIMENT_ENABLED', false),
          weight: numberEnv('GEMINI_SENTIMENT_WEIGHT', 0),
          apiKey: env('GEMINI_API_KEY')
        },
        reddit: {
          enabled: boolEnv('REDDIT_SENTIMENT_ENABLED', false),
          weight: numberEnv('REDDIT_SENTIMENT_WEIGHT', 0)
        }
      }
    }
  };
}

function getConfigPath(config, keyPath) {
  return keyPath.split('.').reduce((value, key) => {
    if (value === undefined || value === null) return undefined;
    return value[key];
  }, config);
}

function requireConfigValues(config, keyPaths, context = 'runtime config') {
  const missing = keyPaths.filter((keyPath) => {
    const value = getConfigPath(config, keyPath);
    return value === undefined || value === null || value === '';
  });

  if (missing.length) {
    throw new Error(`Missing ${context}: ${missing.join(', ')}`);
  }

  return config;
}

module.exports = {
  loadRuntimeConfig,
  requireConfigValues
};

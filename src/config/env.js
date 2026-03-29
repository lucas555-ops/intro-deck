const DEFAULT_LINKEDIN_OIDC_DISCOVERY_URL = 'https://www.linkedin.com/oauth/.well-known/openid-configuration';
const DEFAULT_LINKEDIN_SCOPES = 'openid profile';
const DEFAULT_STATE_TTL_SECONDS = 600;
const DEFAULT_JWKS_CACHE_TTL_SECONDS = 3600;
const DEFAULT_DATABASE_SSLMODE = 'require';
const DEFAULT_TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS = 86400;
const DEFAULT_TELEGRAM_ACTION_THROTTLE_SECONDS = 3;
const DEFAULT_NOTIFICATION_RETRY_DELAY_SECONDS = 300;
const DEFAULT_NOTIFICATION_RETRY_BATCH_SIZE = 10;
const DEFAULT_NOTIFICATION_RETRY_CLAIM_TIMEOUT_SECONDS = 60;
const DEFAULT_NOTIFICATION_MAX_ATTEMPTS = 3;
const DEFAULT_NOTIFICATION_RECEIPT_DIAGNOSTICS_LIMIT = 20;
const DEFAULT_CONTACT_UNLOCK_PRICE_STARS = 75;
const DEFAULT_DM_OPEN_PRICE_STARS = 100;
const DEFAULT_PRO_MONTHLY_PRICE_STARS = 149;
const DEFAULT_PRO_MONTHLY_DURATION_DAYS = 30;

function readEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return typeof value === 'string' ? value.trim() : value;
}

function readRequiredEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readIntegerEnv(name, fallback) {
  const raw = readEnv(name, String(fallback));
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer for ${name}: ${raw}`);
  }
  return parsed;
}

function readTelegramUserIdEnv(name) {
  const raw = readEnv(name, '');
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readTelegramUserIdListEnv(name) {
  const raw = readEnv(name, '');
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function readSecretEnv(name) {
  const secret = readEnv(name);
  if (!secret) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error(`${name} must be 1-256 chars and contain only A-Z, a-z, 0-9, _ and -`);
  }

  return secret;
}

export function getAppConfig() {
  return {
    appBaseUrl: readRequiredEnv('APP_BASE_URL'),
    nodeEnv: readEnv('NODE_ENV', 'development')
  };
}

export function getTelegramConfig() {
  return {
    botToken: readRequiredEnv('TELEGRAM_BOT_TOKEN'),
    webhookSecret: readSecretEnv('TELEGRAM_WEBHOOK_SECRET')
  };
}

export function getLinkedInConfig() {
  const scopesRaw = readEnv('LINKEDIN_SCOPES', DEFAULT_LINKEDIN_SCOPES);
  const scopes = scopesRaw.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const stateSecret = readRequiredEnv('LINKEDIN_STATE_SECRET');

  if (stateSecret.length < 32) {
    throw new Error('LINKEDIN_STATE_SECRET must be at least 32 characters long');
  }

  return {
    clientId: readRequiredEnv('LINKEDIN_CLIENT_ID'),
    clientSecret: readRequiredEnv('LINKEDIN_CLIENT_SECRET'),
    redirectUri: readRequiredEnv('LINKEDIN_REDIRECT_URI'),
    stateSecret,
    stateTtlSeconds: readIntegerEnv('LINKEDIN_STATE_TTL_SECONDS', DEFAULT_STATE_TTL_SECONDS),
    oidcDiscoveryUrl: readEnv('LINKEDIN_OIDC_DISCOVERY_URL', DEFAULT_LINKEDIN_OIDC_DISCOVERY_URL),
    jwksCacheTtlSeconds: readIntegerEnv('LINKEDIN_JWKS_CACHE_TTL_SECONDS', DEFAULT_JWKS_CACHE_TTL_SECONDS),
    scopes
  };
}

export function getRuntimeGuardConfig() {
  return {
    updateDedupeTtlSeconds: readIntegerEnv('TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS', DEFAULT_TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS),
    actionThrottleSeconds: readIntegerEnv('TELEGRAM_ACTION_THROTTLE_SECONDS', DEFAULT_TELEGRAM_ACTION_THROTTLE_SECONDS)
  };
}

export function getNotificationRetryConfig() {
  return {
    retrySecret: readSecretEnv('NOTIFICATION_RETRY_SECRET'),
    cronSecret: readSecretEnv('CRON_SECRET'),
    retryDelaySeconds: readIntegerEnv('NOTIFICATION_RETRY_DELAY_SECONDS', DEFAULT_NOTIFICATION_RETRY_DELAY_SECONDS),
    batchSize: readIntegerEnv('NOTIFICATION_RETRY_BATCH_SIZE', DEFAULT_NOTIFICATION_RETRY_BATCH_SIZE),
    claimTimeoutSeconds: readIntegerEnv('NOTIFICATION_RETRY_CLAIM_TIMEOUT_SECONDS', DEFAULT_NOTIFICATION_RETRY_CLAIM_TIMEOUT_SECONDS),
    maxAttempts: readIntegerEnv('NOTIFICATION_MAX_ATTEMPTS', DEFAULT_NOTIFICATION_MAX_ATTEMPTS)
  };
}

export function getNotificationOpsConfig() {
  return {
    opsSecret: readSecretEnv('NOTIFICATION_OPS_SECRET'),
    defaultDiagnosticsLimit: readIntegerEnv('NOTIFICATION_RECEIPT_DIAGNOSTICS_LIMIT', DEFAULT_NOTIFICATION_RECEIPT_DIAGNOSTICS_LIMIT)
  };
}


export function getPricingConfig() {
  return {
    contactUnlockPriceStars: readIntegerEnv('CONTACT_UNLOCK_PRICE_STARS', DEFAULT_CONTACT_UNLOCK_PRICE_STARS),
    dmOpenPriceStars: readIntegerEnv('DM_OPEN_PRICE_STARS', DEFAULT_DM_OPEN_PRICE_STARS),
    proMonthlyPriceStars: readIntegerEnv('PRO_MONTHLY_PRICE_STARS', DEFAULT_PRO_MONTHLY_PRICE_STARS)
  };
}

export function getSubscriptionConfig() {
  return {
    proMonthlyDurationDays: readIntegerEnv('PRO_MONTHLY_DURATION_DAYS', DEFAULT_PRO_MONTHLY_DURATION_DAYS)
  };
}

export function getOperatorConfig() {
  const adminChatId = readTelegramUserIdEnv('ADMIN_CHAT_ID');
  const founderOperatorIds = readTelegramUserIdListEnv('TG_OPERATOR_IDS');
  const legacyOperatorIds = readTelegramUserIdListEnv('OPERATOR_TELEGRAM_USER_IDS');
  const operatorTelegramUserIds = [...new Set([
    ...(adminChatId ? [adminChatId] : []),
    ...founderOperatorIds,
    ...legacyOperatorIds
  ])];

  return {
    adminChatId,
    founderOperatorIds,
    legacyOperatorIds,
    operatorTelegramUserIds
  };
}

export function isOperatorTelegramUser(telegramUserId) {
  if (!Number.isFinite(Number(telegramUserId))) {
    return false;
  }

  return getOperatorConfig().operatorTelegramUserIds.includes(Number(telegramUserId));
}

export function getDbConfig() {
  const databaseUrl = readEnv('DATABASE_URL');
  if (!databaseUrl) {
    return {
      configured: false,
      databaseUrl: null,
      sslMode: null
    };
  }

  return {
    configured: true,
    databaseUrl,
    sslMode: readEnv('DATABASE_SSLMODE', DEFAULT_DATABASE_SSLMODE)
  };
}

export function getPublicFlags() {
  const dbConfig = getDbConfig();
  const retryConfig = getNotificationRetryConfig();

  const linkedInConfigured = Boolean(
    readEnv('LINKEDIN_CLIENT_ID') &&
      readEnv('LINKEDIN_CLIENT_SECRET') &&
      readEnv('LINKEDIN_REDIRECT_URI') &&
      readEnv('LINKEDIN_STATE_SECRET')
  );

  return {
    dbConfigured: dbConfig.configured,
    linkedInConfigured,
    telegramConfigured: Boolean(readEnv('TELEGRAM_BOT_TOKEN')),
    telegramWebhookSecretConfigured: Boolean(readEnv('TELEGRAM_WEBHOOK_SECRET')),
    runtimeGuardsConfigured: dbConfig.configured,
    notificationReceiptsConfigured: dbConfig.configured && Boolean(readEnv('TELEGRAM_BOT_TOKEN')),
    notificationRetryConfigured: dbConfig.configured && Boolean(readEnv('TELEGRAM_BOT_TOKEN')) && Boolean(retryConfig.retrySecret || retryConfig.cronSecret),
    notificationRetryCronConfigured: Boolean(retryConfig.cronSecret),
    notificationRetryManualConfigured: Boolean(retryConfig.retrySecret),
    notificationOpsConfigured: dbConfig.configured && Boolean(readEnv('NOTIFICATION_OPS_SECRET')),
    operatorDiagnosticsSurfaceConfigured: dbConfig.configured && Boolean(readEnv('NOTIFICATION_OPS_SECRET')) && getOperatorConfig().operatorTelegramUserIds.length > 0
,
    contactUnlockConfigured: dbConfig.configured && Boolean(readEnv('TELEGRAM_BOT_TOKEN')),
    dmRelayConfigured: dbConfig.configured && Boolean(readEnv('TELEGRAM_BOT_TOKEN')),
    pricingConfigured: dbConfig.configured && Boolean(readEnv('TELEGRAM_BOT_TOKEN'))
  };
}

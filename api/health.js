import {
  getNotificationOpsConfig,
  getNotificationRetryConfig,
  getOperatorConfig,
  getPublicFlags,
  getRuntimeGuardConfig
} from '../src/config/env.js';

export default async function handler(req, res) {
  const flags = getPublicFlags();
  const runtimeGuards = getRuntimeGuardConfig();
  const notificationRetry = getNotificationRetryConfig();
  const notificationOps = getNotificationOpsConfig();
  const operatorConfig = getOperatorConfig();
  res.status(200).json({
    ok: true,
    step: 'STEP026.1',
    docsStep: 'STEP026.1',
    service: 'linkedin-telegram-directory-bot',
    flags,
    persistence: {
      enabled: flags.dbConfigured
    },
    webhook: {
      secretConfigured: flags.telegramWebhookSecretConfigured
    },
    runtimeGuards: {
      dbBacked: flags.runtimeGuardsConfigured,
      updateDedupeTtlSeconds: runtimeGuards.updateDedupeTtlSeconds,
      actionThrottleSeconds: runtimeGuards.actionThrottleSeconds
    },
    notificationReceipts: {
      enabled: flags.notificationReceiptsConfigured
    },
    notificationRetry: {
      enabled: flags.notificationRetryConfigured,
      cronAuthConfigured: flags.notificationRetryCronConfigured,
      manualAuthConfigured: flags.notificationRetryManualConfigured,
      batchSize: notificationRetry.batchSize,
      retryDelaySeconds: notificationRetry.retryDelaySeconds,
      claimTimeoutSeconds: notificationRetry.claimTimeoutSeconds,
      maxAttempts: notificationRetry.maxAttempts
    },
    notificationOps: {
      enabled: flags.notificationOpsConfigured,
      defaultDiagnosticsLimit: notificationOps.defaultDiagnosticsLimit
    },
    operatorDiagnosticsSurface: {
      enabled: flags.operatorDiagnosticsSurfaceConfigured,
      operatorCount: operatorConfig.operatorTelegramUserIds.length
    }
  });
}

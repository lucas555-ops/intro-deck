import { getNotificationOpsConfig, getPublicFlags } from '../../src/config/env.js';
import {
  getNotificationReceiptDiagnostics,
  normalizeNotificationReceiptBucket
} from '../../src/lib/storage/notificationStore.js';
import { secretsMatch } from '../../src/lib/crypto/secretCompare.js';

function readOpsSecretHeader(req) {
  return req?.headers?.['x-notification-ops-secret'] || req?.headers?.['X-Notification-Ops-Secret'] || null;
}

function readIntegerParam(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const flags = getPublicFlags();
  if (!flags.notificationReceiptsConfigured) {
    return res.status(503).json({ ok: false, error: 'notification_receipts_not_configured' });
  }

  const opsConfig = getNotificationOpsConfig();
  if (!opsConfig.opsSecret) {
    return res.status(503).json({ ok: false, error: 'notification_ops_secret_not_configured' });
  }

  const providedSecret = readOpsSecretHeader(req);
  if (!secretsMatch(opsConfig.opsSecret, providedSecret)) {
    return res.status(401).json({ ok: false, error: 'invalid_notification_ops_secret' });
  }

  const url = new URL(req.url, 'http://localhost');
  const introRequestId = readIntegerParam(url.searchParams.get('intro_request_id'));
  if (url.searchParams.has('intro_request_id') && introRequestId == null) {
    return res.status(400).json({ ok: false, error: 'invalid_intro_request_id' });
  }

  const limit = readIntegerParam(url.searchParams.get('limit'));
  if (url.searchParams.has('limit') && limit == null) {
    return res.status(400).json({ ok: false, error: 'invalid_limit' });
  }

  const requestedBucket = url.searchParams.get('bucket');
  const bucket = requestedBucket ? normalizeNotificationReceiptBucket(requestedBucket) : null;
  if (requestedBucket && !bucket) {
    return res.status(400).json({ ok: false, error: 'invalid_bucket' });
  }

  try {
    const result = await getNotificationReceiptDiagnostics({
      introRequestId,
      bucket,
      limit
    });

    return res.status(200).json({
      ok: true,
      step: 'STEP024.5',
      docsStep: 'STEP024.5',
      filters: {
        introRequestId,
        bucket,
        limit: limit || opsConfig.defaultDiagnosticsLimit
      },
      availableBuckets: ['sent', 'failed', 'skipped', 'retry_due', 'exhausted'],
      ...result
    });
  } catch (error) {
    console.error('[api/ops/notification-receipts] failed', error);
    return res.status(500).json({ ok: false, error: 'notification_receipt_diagnostics_failed' });
  }
}

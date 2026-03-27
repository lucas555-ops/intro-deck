import { readFileSync } from 'node:fs';

const vercelConfigSource = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
if (!vercelConfigSource.includes('"crons"')) {
  throw new Error('vercel.json must declare cron jobs');
}
if (!vercelConfigSource.includes('/api/cron/notification-retry')) {
  throw new Error('vercel.json must schedule /api/cron/notification-retry');
}

const retryRouteSource = readFileSync(new URL('../api/cron/notification-retry.js', import.meta.url), 'utf8');
if (!retryRouteSource.includes("req.method !== 'GET' && req.method !== 'POST'")) {
  throw new Error('Retry route must accept GET and POST');
}
if (!retryRouteSource.includes('Authorization')) {
  throw new Error('Retry route must inspect Authorization header for cron auth');
}
if (!retryRouteSource.includes('Bearer')) {
  throw new Error('Retry route must support Bearer token auth');
}
if (!retryRouteSource.includes('manual_retry_secret')) {
  throw new Error('Retry route must preserve manual retry secret mode');
}

const envSource = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
if (!envSource.includes('CRON_SECRET')) {
  throw new Error('Env config must expose CRON_SECRET');
}

console.log('OK: cron compatibility contract');

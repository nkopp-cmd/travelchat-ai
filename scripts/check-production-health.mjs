#!/usr/bin/env node
/** Daily read-only user health check. Never records request headers or URL queries. */
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parsePhotoFailure } from './production-health/photo-diagnostics.mjs';
import { classifyUserError, summarizeErrorClasses } from './production-health/error-classes.mjs';
import { summarizeQueryCoverage } from './production-health/query-coverage.mjs';

const account = '664f242340bcec2f32daaeee15f58bde';
const service = 'localley-next';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
const now = Date.now();
const args = process.argv.slice(2);
const reportIndex = args.indexOf('--report');
const destination = reportIndex < 0 ? join(homedir(), '.local/state/localley/production-health.json') : args[reportIndex + 1];
if (!destination) throw new Error('--report needs a path');
const sanitize = value => String(value || '')
  .replace(/https?:\/\/[^\s]+/g, '[URL]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':id')
  .replace(/\buser_[A-Za-z0-9]+\b/g, ':user')
  .replace(/\b(?:Bearer|token|password|secret|api[_-]?key)\s*[:= ]\s*[^\s,;]+/gi, '[redacted]')
  .slice(0, 400);
const pathOf = value => {
  try { return sanitize(new URL(value).pathname); } catch { return ''; }
};
const health = await Promise.all(['/', '/sign-in', '/api/cities?noCache=true&includeHidden=true'].map(async path => {
  try {
    const response = await fetch(`https://www.localley.io${path}`, { signal: AbortSignal.timeout(25000) });
    await response.body?.cancel();
    return { path: path.split('?')[0], status: response.status };
  } catch { return { path: path.split('?')[0], status: null, error: 'request failed or timed out' }; }
}));
const query = {
  queryId: 'localley-daily-user-errors',
  timeframe: { from: now - 86400000, to: now }, dry: true, view: 'events', limit: 500,
  parameters: { filters: [
    { key: '$metadata.service', operation: 'eq', type: 'string', value: service },
    { kind: 'group', filterCombination: 'or', filters: [
      { key: '$metadata.level', operation: 'eq', type: 'string', value: 'error' },
      { key: '$workers.event.response.status', operation: 'gte', type: 'number', value: 500 },
    ] },
  ] },
};
let logs;
try {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(query), signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.success || data.errors?.length || data.result?.run?.status !== 'COMPLETED') throw new Error('query incomplete');
  const events = data.result?.events?.events;
  if (!Array.isArray(events)) throw new Error('missing events');
  const groups = new Map();
  const photoGroups = new Map();
  for (const event of events) {
    const metadata = event.$metadata || {}, worker = event.$workers || {};
    // Refuse unrelated service events even if the provider filter changes.
    if (metadata.service !== service) throw new Error('unexpected service');
    const path = pathOf(metadata.url || worker.event?.request?.url);
    // Never persist raw log text: an upstream exception can contain a credential
    // without a recognizable label. Keep diagnostic classes, not payloads.
    const raw = String(metadata.error || metadata.message || '');
    const photoFailure = parsePhotoFailure(raw);
    if (photoFailure) {
      const key = JSON.stringify(photoFailure);
      photoGroups.set(key, (photoGroups.get(key) || 0) + 1);
    }
    const candidateStatus = photoFailure?.status ?? worker.event?.response?.status;
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 100 && candidateStatus <= 599 ? candidateStatus : null;
    const classification = classifyUserError(raw, path, status);
    const key = JSON.stringify({ path, ...classification, status });
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const classifiedGroups = [...groups].map(([key, count]) => ({ ...JSON.parse(key), count }));
  logs = { available: true, observedEvents: events.length, ...summarizeQueryCoverage(data.result, events.length),
    countingUnit: 'log_events_not_requests_or_users',
    photoFailures: [...photoGroups].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, count]) => ({ ...JSON.parse(key), count })),
    errorClasses: summarizeErrorClasses(classifiedGroups),
    top5: classifiedGroups.sort((a, b) => b.count - a.count).slice(0, 5) };

} catch (error) {
  const message = String(error.message);
  logs = { available: false, error: /^(HTTP \d{3}|query incomplete|missing events|unexpected service)$/.test(message)
    ? message : 'Query failed or timed out' };
}
const report = { checkedAt: new Date(now).toISOString(), windowHours: 24, service, health, logs };
await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ checkedAt: report.checkedAt, health, logs, report: destination }));
if (!logs.available || health.some(check => check.status !== 200)) process.exitCode = 1;

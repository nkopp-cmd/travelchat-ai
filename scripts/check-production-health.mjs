#!/usr/bin/env node
/** Daily read-only user health check. Never records customer request headers or URL queries. */
import { mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { checkLogDelivery, validLogProbe } from './production-health/log-delivery.mjs';
import { checkSourceDatabase } from './production-health/source-database.mjs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parsePhotoFailure } from './production-health/photo-diagnostics.mjs';
import { classifyUserError, summarizeErrorClasses } from './production-health/error-classes.mjs';
import { summarizeQueryCoverage } from './production-health/query-coverage.mjs';
import { auditIngestionSettings } from './production-health/ingestion-settings.mjs';
import { recordEventTime, summarizeEventTime } from './production-health/event-times.mjs';
import { checkCityCatalog } from './production-health/city-catalog.mjs';
import { errorRouteGroup } from './production-health/route-groups.mjs';
import { summarizeWorkerVersions, workerVersionId } from './production-health/worker-versions.mjs';
import { checkPageBody } from './production-health/page-body.mjs';

const account = '664f242340bcec2f32daaeee15f58bde';
const service = 'localley-next';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
const now = Date.now();
const ingestionSettings = await auditIngestionSettings(token);
const args = process.argv.slice(2);
const reportIndex = args.indexOf('--report');
const destination = reportIndex < 0 ? join(homedir(), '.local/state/localley/production-health.json') : args[reportIndex + 1];
if (!destination) throw new Error('--report needs a path');
const probeFile = destination + '.logging-probe.json';
let previousProbe, currentProbe;
try { previousProbe = JSON.parse(await readFile(probeFile, 'utf8')); } catch {}
let sourceDatabase;
if (args.includes('--source-check')) {
  let configuration;
  try { configuration = parseEnv(await readFile(join(process.cwd(), '.env.local'), 'utf8')); } catch {}
  sourceDatabase = await checkSourceDatabase(configuration);
}
// Short UUID groups avoid provider secret redaction; URLSearchParams matches provider encoding.
const citiesPath = '/api/cities?' + new URLSearchParams({ noCache: 'true', includeHidden: 'true',
  healthCanary: randomUUID().replaceAll('-', '~') });
const health = await Promise.all(['/', '/sign-in', citiesPath].map(async path => {
  try {
    const startedAt = Date.now();
    const response = await fetch(`https://www.localley.io${path}`, { redirect: 'error', signal: AbortSignal.timeout(25000) });
    const catalog = path.startsWith('/api/cities?') ? await checkCityCatalog(response) : undefined;
    const pageBody = catalog ? undefined : await checkPageBody(response);
    if (catalog?.usable && response.status === 200) currentProbe = { version: 1, startedAt, status: 200, url: `https://www.localley.io${path}` };
    return { path: path.split('?')[0], status: response.status, ...(catalog ? { catalog } : { pageBody }) };
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
  const versionGroups = new Map();
  const photoGroups = new Map();
  let totalEventTimes = null;
  for (const event of events) {
    const metadata = event.$metadata || {}, worker = event.$workers || {};
    totalEventTimes = recordEventTime(totalEventTimes, event.timestamp, query.timeframe);
    // Refuse unrelated service events even if the provider filter changes.
    if (metadata.service !== service) throw new Error('unexpected service');
    const path = errorRouteGroup(metadata.url || worker.event?.request?.url);
    // Never persist raw log text: an upstream exception can contain a credential
    // without a recognizable label. Keep diagnostic classes, not payloads.
    const raw = String(metadata.error || metadata.message || '');
    const photoFailure = parsePhotoFailure(raw);
    if (photoFailure) {
      const key = JSON.stringify(photoFailure);
      photoGroups.set(key, recordEventTime(photoGroups.get(key), event.timestamp, query.timeframe));
    }
    const candidateStatus = photoFailure?.status ?? worker.event?.response?.status;
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 100 && candidateStatus <= 599 ? candidateStatus : null;
    const classification = classifyUserError(raw, path, status);
    const key = JSON.stringify({ path, ...classification, status });
    groups.set(key, recordEventTime(groups.get(key), event.timestamp, query.timeframe));
    const versionKey = JSON.stringify({ versionId: workerVersionId(event), ...JSON.parse(key) });
    versionGroups.set(versionKey, recordEventTime(versionGroups.get(versionKey), event.timestamp, query.timeframe));
  }
  const classifiedGroups = [...groups].map(([key, times]) => ({ ...JSON.parse(key), ...summarizeEventTime(times) }));
  logs = { available: true, observedEvents: events.length, ...summarizeQueryCoverage(data.result, events.length),
    workerVersions: summarizeWorkerVersions(events, query.timeframe,
      [...versionGroups].map(([key, times]) => ({ ...JSON.parse(key), ...summarizeEventTime(times) }))),
    countingUnit: 'log_events_not_requests_or_users',
    eventTimes: totalEventTimes ? summarizeEventTime(totalEventTimes).eventTimes : { firstSeen: null, lastSeen: null, knownCount: 0, unknownCount: 0, scope: 'returned_events_only' },
    photoFailures: [...photoGroups].sort((a, b) => b[1].count - a[1].count).slice(0, 20).map(([key, times]) => ({ ...JSON.parse(key), ...summarizeEventTime(times) })),
    errorClasses: summarizeErrorClasses(classifiedGroups),
    top5: classifiedGroups.sort((a, b) => b.count - a.count).slice(0, 5) };

} catch (error) {
  const message = String(error.message);
  logs = { available: false, error: /^(HTTP \d{3}|query incomplete|missing events|unexpected service)$/.test(message)
    ? message : 'Query failed or timed out' };
}
const loggingCanary = await checkLogDelivery(token, previousProbe);
const report = { checkedAt: new Date(now).toISOString(), windowHours: 24, service, health, logs, ingestionSettings, loggingCanary, ...(sourceDatabase ? { sourceDatabase } : {}) };
await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
if (validLogProbe(currentProbe)) {
  const temporary = probeFile + '.next-' + randomUUID();
  try {
    await writeFile(temporary, JSON.stringify(currentProbe) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, probeFile);
  } finally {
    await rm(temporary, { force: true });
  }
}
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ checkedAt: report.checkedAt, health, logs, ingestionSettings, loggingCanary, ...(sourceDatabase ? { sourceDatabase } : {}), report: destination }));
if (sourceDatabase?.usable === false || !logs.available || !ingestionSettings.usable || health.some(check => check.status !== 200 || check.catalog?.usable === false || check.pageBody?.usable === false)) process.exitCode = 1;

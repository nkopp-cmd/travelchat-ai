// Manual diagnostic transport only. Never imported by the daily health checker.
import http from 'node:http';
import https from 'node:https';

export function exchangeRscBody(url, {
  headers = {}, agent, disconnectAfterFirstChunk = false,
  deadlineMs = 25000, maxBytes = 2097152, onRedirect = () => {},
} = {}) {
  if (!(url instanceof URL) || !['http:', 'https:'].includes(url.protocol)
      || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 25000
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2097152) {
    return Promise.reject(Error('invalid_transport_options'));
  }
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const row = { status: null, bytes: 0, complete: false,
      disconnectRequested: false, headersBeforeDisconnect: false,
      parserCompleteAtDisconnect: null, reusedSocket: false,
      contentTypeRsc: false, errorFrames: false };
    let settled = false;
    const chunks = [];
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      row.elapsedMs = Date.now() - started;
      // Keep body, headers, URL and credentials in caller memory only.
      row.errorFrames = /(?:^|\n)[a-f0-9]+:E\{/.test(Buffer.concat(chunks).toString('utf8'));
      chunks.length = 0;
      if (error) reject(Error(error));
      else resolve(row);
    };
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET', headers, agent,
    }, res => {
      row.status = res.statusCode;
      row.contentTypeRsc = String(res.headers['content-type'] || '').startsWith('text/x-component');
      if (res.statusCode === 307) {
        try { onRedirect(res.headers.location); }
        catch { finish('redirect_callback'); req.destroy(); return; }
      }
      res.on('data', chunk => {
        if (settled) return;
        row.bytes += chunk.length;
        if (row.bytes > maxBytes) { finish('response_bound'); req.destroy(); return; }
        chunks.push(chunk);
        if (disconnectAfterFirstChunk && !row.disconnectRequested && row.bytes > 0) {
          row.disconnectRequested = true;
          row.headersBeforeDisconnect = true;
          row.parserCompleteAtDisconnect = res.complete;
          // Destroy synchronously in data: a timer can miss the body-transfer phase.
          res.destroy();
          req.destroy();
          finish();
        }
      });
      res.on('end', () => { row.complete = res.complete; finish(); });
      res.on('aborted', () => { if (!row.disconnectRequested) finish('unexpected_body_abort'); });
      res.on('error', () => { if (!row.disconnectRequested) finish('unexpected_body_error'); });
      res.on('close', () => {
        if (!settled && !res.complete) finish('unexpected_body_close');
      });
    });
    const deadline = setTimeout(() => { finish('deadline'); req.destroy(); }, deadlineMs);
    req.on('finish', () => { row.reusedSocket = req.reusedSocket; });
    req.on('error', () => { if (!row.disconnectRequested) finish('unexpected_request_error'); });
    req.end();
  });
}

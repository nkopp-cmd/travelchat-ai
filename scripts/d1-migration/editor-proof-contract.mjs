/** Exact denial contracts observed through the preview middleware and Next.js. */
export function privateNoStore(header) {
  if (typeof header !== 'string' || !header.trim()) return false;
  const directives = header.toLowerCase().split(',').map(value => value.trim());
  const allowed = /^(?:private|no-store|no-cache|must-revalidate|max-age\s*=\s*(?:0|"0"))$/;
  return directives.every(value => allowed.test(value))
    && directives.includes('private') && directives.includes('no-store');
}

export function editorWriteDenied(response, expectedStatus) {
  if (!response || response.status !== expectedStatus) return false;
  if (expectedStatus === 401) {
    return response.cache === 'no-store' && response.source === null
      && response.body?.error === 'Unauthorized';
  }
  const expectedCode = expectedStatus === 403 ? 'forbidden'
    : expectedStatus === 404 ? 'not_found' : null;
  return expectedCode !== null && response.source === 'd1-preview'
    && privateNoStore(response.cache) && response.body?.error?.code === expectedCode;
}

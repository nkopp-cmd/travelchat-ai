import { parsePhotoFailure } from './photo-diagnostics.mjs';

// Return fixed labels only. Logs can contain model output, prompts and credentials.
export function classifyUserError(raw, path, status) {
  const text = typeof raw === 'string' ? raw : '';
  const photoFailure = parsePhotoFailure(text);
  if (photoFailure) return { errorClass: 'venue_photo_' + photoFailure.reason,
    message: `Venue photos: ${photoFailure.reason}` };
  if (path === '/api/itineraries/generate') {
    if (text.startsWith('Failed to parse GLM response; retrying with OpenAI:')) {
      return { errorClass: 'glm_invalid_json', message: 'Primary trip format failed; existing fallback requested' };
    }
    if (text.startsWith('[generate] GLM primary failed; falling back to OpenAI:')) {
      return { errorClass: 'glm_primary_failed', message: 'Primary trip provider failed; existing fallback requested' };
    }
    if (text.startsWith('Failed to parse OpenAI response:')) {
      return { errorClass: 'openai_invalid_json', message: 'OpenAI trip format failed' };
    }
    if (text.startsWith('Error generating itinerary:')) {
      return { errorClass: 'generation_request_failed', message: 'Trip generation request failed' };
    }
  }
  if (path === '/api/notifications/preferences' && status === 503) {
    return { errorClass: 'notification_preferences_unavailable', message: 'Notification preferences unavailable' };
  }
  if (path === '/api/notifications/preferences' && status >= 500 && status <= 599) {
    return { errorClass: 'notification_preferences_failed', message: 'Notification preference request failed' };
  }
  if (/^\/api\/spots\/[^/]+\/photos$/.test(path) && status >= 500 && status <= 599) {
    return { errorClass: 'venue_photos_failed', message: 'Venue photo request failed; source reason unavailable' };
  }
  if (text.includes('[auth] user hook failed')) return { errorClass: 'auth_profile_sync_failed', message: 'Auth profile synchronization failed' };
  if (text.includes('Cannot coerce the result to a single JSON object')) return { errorClass: 'application_record_missing', message: 'Application record not found' };
  if (text.includes('Network connection lost.')) return { errorClass: 'network_connection_lost', message: 'Network connection lost' };
  if (text.startsWith('GET ') || text.startsWith('POST ')) return { errorClass: 'http_request_failed', message: 'HTTP request failed' };
  return { errorClass: 'server_error_unclassified', message: 'Server error; inspect private Cloudflare logs' };
}

export function summarizeErrorClasses(groups) {
  const classes = new Map();
  for (const { errorClass, message, status, count } of groups) {
    const group = classes.get(errorClass) || { errorClass, message, count: 0, statuses: {} };
    group.count += count;
    const key = Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : 'unknown';
    group.statuses[key] = (group.statuses[key] || 0) + count;
    classes.set(errorClass, group);
  }
  return [...classes.values()].sort((a, b) => b.count - a.count || a.errorClass.localeCompare(b.errorClass));
}

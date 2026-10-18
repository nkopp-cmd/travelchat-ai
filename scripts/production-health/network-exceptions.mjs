import { classifyUserError } from './error-classes.mjs';
import { errorRouteGroup } from './route-groups.mjs';

// Inspect field availability only. Never persist exception names, stacks or payloads.
export function summarizeNetworkExceptions(events) {
  if (!Array.isArray(events)) throw Error('Invalid network diagnostic input');
  const result = { scope: 'returned_network_error_events_only', events: 0,
    withExceptionObject: 0, withRecognizedStackField: 0, withoutRecognizedStackField: 0,
    bodyCompletion: 'not_observed', cause: 'not_established' };
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const stack = x => typeof x === 'string' && x.trim().length > 0;
  for (const event of events) {
    if (event?.$metadata?.service !== 'localley-next') continue;
    const raw = String(event.$metadata.error || event.$metadata.message || '');
    const path = errorRouteGroup(event.$metadata.url || event.$workers?.event?.request?.url);
    if (classifyUserError(raw, path, null).errorClass !== 'network_connection_lost') continue;
    result.events++;
    const exception = event.source?.exception;
    if (object(exception)) result.withExceptionObject++;
    const candidates = [exception, event.source, event, event.$metadata];
    if (candidates.some(x => object(x) && [x.stack, x.stacktrace, x.stackTrace].some(stack))) {
      result.withRecognizedStackField++;
    } else result.withoutRecognizedStackField++;
  }
  return result;
}

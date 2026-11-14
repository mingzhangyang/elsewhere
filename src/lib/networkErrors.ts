/**
 * Turns low-level request failures into messages a reader can act on. Browsers report these as
 * "Failed to fetch", "Load failed", "signal timed out" or a JSON parse error; messages this app wrote
 * itself are already readable and pass through.
 */
export type NetworkService = 'weather' | 'search';

const wording = {
  weather: { name: 'the weather service', retry: 'Try refreshing.' },
  search: { name: 'place search', retry: 'Try again.' },
} as const;

export class ReadableError extends Error {}

export function describeNetworkFailure(error: unknown, service: NetworkService): string {
  const { name, retry } = wording[service];
  if (error instanceof ReadableError) return error.message;
  const kind = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (kind === 'TimeoutError') return `${capitalize(name)} took too long to respond. ${retry}`;
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return `You appear to be offline. Reconnect, then ${retry.toLowerCase()}`;
  // fetch rejects with a TypeError when the request never reaches the server.
  if (kind === 'TypeError') return `Couldn’t reach ${name}. Check your connection. ${retry}`;
  if (kind === 'SyntaxError') return `${capitalize(name)} sent a response that couldn’t be read. ${retry}`;
  return `Couldn’t load ${service === 'weather' ? 'weather' : 'places'}. ${retry}`;
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

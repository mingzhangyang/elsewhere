import { describe, expect, it } from 'vitest';
import { mergeExplorerProps, routeForHash } from '../src/RouteShell';
import { scenarioProps } from '../src/dev/scenarios';
import { limitArtworkText } from '../src/lib/skyCreatorDraft';

describe('SM3-C navigation and private draft contract', () => {
  it('recognizes only the non-personal #create route', () => {
    expect(routeForHash('#create')).toBe('create');
    expect(routeForHash('')).toBe('explore');
    expect(routeForHash('#sky=%7B%7D')).toBe('explore');
    expect(routeForHash('#artwork=not-yet-supported')).toBe('explore');
    expect(routeForHash('#create?date=2000-01-01')).toBe('explore');
  });

  it('preserves deterministic scenario inputs when route props are undefined', () => {
    const fixture = scenarioProps('polar');
    const props = mergeExplorerProps(fixture, {
      initialLocation: undefined,
      initialTime: undefined,
      weatherLoader: undefined,
      diagnostics: true,
    });
    expect(fixture.initialLocation).toBeDefined();
    expect(props.initialLocation).toBe(fixture.initialLocation);
    expect(props.initialTime?.toISOString()).toBe('2026-12-21T12:00:00.000Z');
    expect(props.weatherLoader).toBe(fixture.weatherLoader);
    expect(props.diagnostics).toBe(true);
  });

  it('lets a creator moment override scenario location and time', () => {
    const fixture = scenarioProps('polar');
    const location = scenarioProps('south').initialLocation!;
    const time = new Date('2026-06-22T01:15:00.000Z');
    const props = mergeExplorerProps(fixture, { initialLocation: location, initialTime: time });
    expect(props.initialLocation).toBe(location);
    expect(props.initialTime).toBe(time);
    expect(props.weatherLoader).toBe(fixture.weatherLoader);
  });

  it('counts combined glyphs and emoji as grapheme clusters, not UTF-16 units', () => {
    expect(limitArtworkText('a\u0301'.repeat(42), 40)).toBe('a\u0301'.repeat(40));
    expect(limitArtworkText('👩‍🚀'.repeat(82), 80)).toBe('👩‍🚀'.repeat(80));
    expect(limitArtworkText('星'.repeat(50), 40)).toBe('星'.repeat(40));
  });

  it('keeps text as text, not HTML or Markdown markup', () => {
    expect(limitArtworkText('<script>test</script>', 80)).toBe('<script>test</script>');
    expect(limitArtworkText('**stars**', 40)).toBe('**stars**');
  });

  it('uses original input without adding personal data to route', () => {
    const input = '虚构的纪念 🌙';
    expect(limitArtworkText(input, 80)).toBe(input);
    expect(routeForHash('#create')).toBe('create');
    expect('#create').not.toContain(input);
  });
});

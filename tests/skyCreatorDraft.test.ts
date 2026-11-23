import { describe, expect, it } from 'vitest';
import { routeForHash } from '../src/RouteShell';
import { limitArtworkText } from '../src/lib/skyCreatorDraft';

describe('SM3-C navigation and private draft contract', () => {
  it('recognizes only the non-personal #create route', () => {
    expect(routeForHash('#create')).toBe('create');
    expect(routeForHash('')).toBe('explore');
    expect(routeForHash('#sky=%7B%7D')).toBe('explore');
    expect(routeForHash('#artwork=not-yet-supported')).toBe('explore');
    expect(routeForHash('#create?date=2000-01-01')).toBe('explore');
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

import { describe, expect, it } from 'vitest';
import { hasAllowedOrigin } from '../src/lib/request-origin';
describe('public origin validation', () => {
  it('accepts localhost aliases without accepting foreign origins', () => {
    expect(
      hasAllowedOrigin(
        new Request('http://localhost:3000/api/plan', {
          headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
        }),
      ),
    ).toBe(true);
    expect(
      hasAllowedOrigin(
        new Request('http://localhost:3000/api/plan', {
          headers: { host: '127.0.0.1:3000', origin: 'http://evil.example' },
        }),
      ),
    ).toBe(false);
  });
  it('accepts forwarded HTTPS and rejects invalid origins, schemes and userinfo', () => {
    expect(
      hasAllowedOrigin(
        new Request('http://internal/api/plan', {
          headers: {
            'x-forwarded-host': 'relay.example',
            'x-forwarded-proto': 'https',
            origin: 'https://relay.example',
          },
        }),
      ),
    ).toBe(true);
    for (const origin of ['null', 'not-a-url', 'http://relay.example', 'https://relay.example/'])
      expect(
        hasAllowedOrigin(
          new Request('http://internal/api/plan', {
            headers: { host: 'relay.example', 'x-forwarded-proto': 'https', origin },
          }),
        ),
      ).toBe(false);
    expect(
      hasAllowedOrigin(
        new Request('http://internal/api/plan', {
          headers: { host: 'user@relay.example', origin: 'http://relay.example' },
        }),
      ),
    ).toBe(false);
  });
});

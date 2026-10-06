import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataset } from '../src/lib/engine';
import { demoBundle, demoProposal } from '../src/lib/demo';
import { inspectDataset } from '../src/lib/planner';
import { GET, POST } from '../src/app/api/plan/route';

vi.mock('../src/lib/live-planner', () => ({
  livePlan: vi.fn(async () => ({ proposal: demoProposal, trace: [], provider: 'live' })),
}));
const inspection = inspectDataset(createDataset(demoBundle));
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://relay.example/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
afterEach(() => vi.unstubAllEnvs());
describe('live API boundary', () => {
  it('exposes availability without exposing the API key or access token', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'private-key');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', 'private-token');
    const response = await GET();
    expect(await response.json()).toMatchObject({ liveAvailable: true, tokenRequired: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('returns a clear unavailable status without a configured provider', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await POST(request(inspection))).status).toBe(503);
  });
  it('blocks cross-origin requests and invalid bearer tokens', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', 'test-token');
    expect((await POST(request(inspection, { origin: 'https://other.example' }))).status).toBe(403);
    expect((await POST(request(inspection, { authorization: 'Bearer wrong' }))).status).toBe(401);
  });
  it('accepts the public host when Next runs behind a proxy or a local hostname alias', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', '');
    const response = await POST(
      new Request('http://localhost:3000/api/plan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://relay.example',
          host: 'relay.example',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify(inspection),
      }),
    );
    expect(response.status).toBe(200);
  });
  it('rejects raw records, malformed JSON, large payloads and wrong media types', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', '');
    expect((await POST(request({ ...inspection, records: demoBundle.records }))).status).toBe(400);
    expect((await POST(request('{invalid'))).status).toBe(400);
    expect((await POST(request('x'.repeat(64_001)))).status).toBe(413);
    expect((await POST(request(inspection, { 'content-type': 'text/plain' }))).status).toBe(415);
  });
  it('accepts only an authenticated bounded inspection payload', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', 'test-token');
    const response = await POST(
      request(inspection, { authorization: 'Bearer test-token', origin: 'https://relay.example' }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).provider).toBe('live');
  });
});

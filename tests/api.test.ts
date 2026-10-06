import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataset } from '../src/lib/engine';
import { demoBundle, demoProposal } from '../src/lib/demo';
import { inspectDataset } from '../src/lib/planner';
import { GET, POST } from '../src/app/api/plan/route';
import { livePlan } from '../src/lib/live-planner';

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
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
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
  it('correlates successful HTTP requests with structured logs without payload data', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'private-api-key');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', '');
    const response = await POST(request(inspection));
    const requestId = response.headers.get('x-request-id');
    const events = vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(line));
    expect(requestId).toBeTruthy();
    expect(events.map((e) => e.event)).toEqual(['request.started', 'request.completed']);
    expect(events.every((e) => e.requestId === requestId)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('private-api-key');
    expect(JSON.stringify(events)).not.toContain(inspection.name);
  });
  it('logs classified provider timeouts and returns a traceable failure', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', '');
    vi.mocked(livePlan).mockRejectedValueOnce(
      new DOMException('Private provider detail', 'AbortError'),
    );
    const response = await POST(request(inspection));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).toContain('90-second deadline');
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
    const events = vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      event: 'request.failed',
      code: 'PROVIDER_TIMEOUT',
      status: 502,
    });
    expect(JSON.stringify(events)).not.toContain('Private provider detail');
  });
  it('classifies malformed provider output as an upstream failure rather than invalid user input', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubEnv('PLANNER_ACCESS_TOKEN', '');
    vi.mocked(livePlan).mockRejectedValueOnce(new SyntaxError('Private provider payload'));
    const response = await POST(request(inspection));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('AI provider returned invalid JSON');
    const events = vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      event: 'request.failed',
      code: 'PROVIDER_FAILURE',
      status: 502,
    });
    expect(JSON.stringify(events)).not.toContain('Private provider payload');
  });
});

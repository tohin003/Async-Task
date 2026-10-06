import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { inspectionSchema } from '@/lib/planner';
import { livePlan } from '@/lib/live-planner';
import { hasAllowedOrigin } from '@/lib/request-origin';
import { PLANNER_DEADLINE_MS } from '@/lib/planner-limits';
import { createPlannerLog, type PlannerFailureCode } from '@/lib/planner-logs';

export const runtime = 'nodejs';
export const maxDuration = 120;
const json = (body: unknown, status = 200, requestId?: string) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(requestId ? { 'X-Request-Id': requestId } : {}) },
  });
export async function GET() {
  return json({
    liveAvailable: Boolean(process.env.OPENAI_API_KEY),
    tokenRequired: Boolean(process.env.PLANNER_ACCESS_TOKEN),
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  });
}
export async function POST(request: Request) {
  const log = createPlannerLog();
  log.write({ event: 'request.started' });
  const reject = (error: string, status: number, code: PlannerFailureCode) => {
    log.write({ event: status < 500 ? 'request.rejected' : 'request.failed', status, code });
    return json({ error, requestId: log.requestId }, status, log.requestId);
  };
  if (!process.env.OPENAI_API_KEY)
    return reject(
      'Live planning is not configured. Use demo planning or set OPENAI_API_KEY in Vercel.',
      503,
      'NOT_CONFIGURED',
    );
  // Restrict browser requests to this deployment; the optional token protects paid API access.
  if (!hasAllowedOrigin(request))
    return reject('Cross-origin planning requests are blocked.', 403, 'ORIGIN_BLOCKED');
  if (process.env.PLANNER_ACCESS_TOKEN) {
    const supplied = Buffer.from(
      request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
    );
    const expected = Buffer.from(process.env.PLANNER_ACCESS_TOKEN);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return reject('A valid planner access token is required.', 401, 'UNAUTHORIZED');
  }
  if (!request.headers.get('content-type')?.includes('application/json'))
    return reject('Send an application/json inspection payload.', 415, 'INVALID_CONTENT_TYPE');
  try {
    // Stream the request with a cap; do not trust Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reject('Inspection payload is required.', 400, 'MISSING_BODY');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64_000) {
        await reader.cancel();
        return reject('Inspection payload exceeds 64 KB.', 413, 'PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reject('Inspection payload must be valid JSON.', 400, 'INVALID_JSON');
    }
    const parsed = inspectionSchema.safeParse(payload);
    if (!parsed.success)
      return reject(
        'Inspection payload failed schema or profile validation.',
        400,
        'INVALID_INSPECTION',
      );
    const result = await livePlan(
      parsed.data,
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      undefined,
      log.write,
    );
    log.write({
      event: 'request.completed',
      status: 200,
      mappings: result.proposal.mappings.length,
      questions: result.proposal.questions.length,
    });
    return json(result, 200, log.requestId);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    const message = timedOut
      ? `Planning exceeded the ${PLANNER_DEADLINE_MS / 1000}-second deadline. Try again or select demo planning.`
      : error instanceof SyntaxError
        ? 'AI provider returned invalid JSON. Try again or select demo planning.'
        : error instanceof Error
          ? error.message
          : 'Planning failed.';
    return reject(message, 502, timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILURE');
  }
}

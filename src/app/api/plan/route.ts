import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { inspectionSchema } from '@/lib/planner';
import { livePlan } from '@/lib/live-planner';
import { hasAllowedOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  return json({
    liveAvailable: Boolean(process.env.OPENAI_API_KEY),
    tokenRequired: Boolean(process.env.PLANNER_ACCESS_TOKEN),
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  });
}
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY)
    return json(
      {
        error:
          'Live planning is not configured. Use demo planning or set OPENAI_API_KEY in Vercel.',
      },
      503,
    );
  // Restrict browser requests to this deployment; the optional token protects paid API access.
  if (!hasAllowedOrigin(request))
    return json({ error: 'Cross-origin planning requests are blocked.' }, 403);
  if (process.env.PLANNER_ACCESS_TOKEN) {
    const supplied = Buffer.from(
      request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
    );
    const expected = Buffer.from(process.env.PLANNER_ACCESS_TOKEN);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return json({ error: 'A valid planner access token is required.' }, 401);
  }
  if (!request.headers.get('content-type')?.includes('application/json'))
    return json({ error: 'Send an application/json inspection payload.' }, 415);
  try {
    // Stream the request with a cap; do not trust Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Inspection payload is required.' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64_000) {
        await reader.cancel();
        return json({ error: 'Inspection payload exceeds 64 KB.' }, 413);
      }
      chunks.push(value);
    }
    const parsed = inspectionSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success)
      return json({ error: 'Inspection payload failed schema or profile validation.' }, 400);
    return json(
      await livePlan(
        parsed.data,
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      ),
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      return json({ error: 'Inspection payload must be valid JSON.' }, 400);
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Planning exceeded the 45-second deadline. Try again or select demo planning.'
        : error instanceof Error
          ? error.message
          : 'Planning failed.';
    return json({ error: message }, 502);
  }
}

import { randomUUID } from 'node:crypto';
import type { TOOL_NAMES } from './planner';

export type PlannerStep =
  | { event: 'provider.round'; round: number }
  | {
      event: 'tool.completed';
      round: number;
      tool: (typeof TOOL_NAMES)[number] | 'unknown';
      status: 'passed' | 'blocked';
    }
  | { event: 'proposal.repair'; round: number };
export type PlannerFailureCode =
  | 'NOT_CONFIGURED'
  | 'ORIGIN_BLOCKED'
  | 'UNAUTHORIZED'
  | 'INVALID_CONTENT_TYPE'
  | 'MISSING_BODY'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_INSPECTION'
  | 'INVALID_JSON'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_FAILURE';
type PlannerLogEvent =
  | PlannerStep
  | { event: 'request.started' }
  | { event: 'request.completed'; status: number; mappings: number; questions: number }
  | { event: 'request.rejected' | 'request.failed'; status: number; code: PlannerFailureCode };

// Select metadata explicitly. Never serialize prompts, arguments, values, headers or errors.
export function createPlannerLog(writer: (line: string) => void = (line) => console.info(line)) {
  const requestId = randomUUID();
  const started = Date.now();
  function write(entry: PlannerLogEvent) {
    let metadata: Record<string, string | number> = {};
    switch (entry.event) {
      case 'provider.round':
      case 'proposal.repair':
        metadata = { round: entry.round };
        break;
      case 'tool.completed':
        metadata = { round: entry.round, tool: entry.tool, status: entry.status };
        break;
      case 'request.completed':
        metadata = { status: entry.status, mappings: entry.mappings, questions: entry.questions };
        break;
      case 'request.rejected':
      case 'request.failed':
        metadata = { status: entry.status, code: entry.code };
        break;
    }
    writer(
      JSON.stringify({
        version: 1,
        service: 'relay.planner',
        timestamp: new Date().toISOString(),
        requestId,
        elapsedMs: Math.max(0, Date.now() - started),
        event: entry.event,
        ...metadata,
      }),
    );
  }
  return { requestId, write };
}

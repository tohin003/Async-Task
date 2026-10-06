import { describe, expect, it } from 'vitest';
import { createPlannerLog } from '../src/lib/planner-logs';

describe('structured planning logs', () => {
  it('correlates workflow events with generated request identity and timing', () => {
    const records: Record<string, unknown>[] = [];
    const log = createPlannerLog((line) => records.push(JSON.parse(line)));
    log.write({ event: 'request.started' });
    log.write({ event: 'provider.round', round: 1 });
    log.write({ event: 'tool.completed', round: 1, tool: 'inspect_schemas', status: 'passed' });
    log.write({ event: 'request.completed', status: 200, mappings: 8, questions: 2 });
    expect(new Set(records.map((r) => r.requestId))).toEqual(new Set([log.requestId]));
    expect(records.map((r) => r.event)).toEqual([
      'request.started',
      'provider.round',
      'tool.completed',
      'request.completed',
    ]);
    expect(
      records.every(
        (r) => r.service === 'relay.planner' && typeof r.elapsedMs === 'number' && r.elapsedMs >= 0,
      ),
    ).toBe(true);
    expect(records.every((r) => !Number.isNaN(Date.parse(r.timestamp as string)))).toBe(true);
  });
  it('drops accidental sensitive fields rather than serializing arbitrary objects', () => {
    const lines: string[] = [];
    const log = createPlannerLog((line) => lines.push(line));
    const unsafe = {
      event: 'request.failed' as const,
      status: 502,
      code: 'PROVIDER_FAILURE' as const,
      error: new Error('sensitive provider text'),
      apiKey: 'never-log-this-key',
      headers: { authorization: 'never-log-this-token' },
      records: [{ email: 'private@example.test' }],
      prompt: 'private prompt',
    };
    log.write(unsafe);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: 'request.failed',
      code: 'PROVIDER_FAILURE',
      status: 502,
    });
    for (const value of [
      'sensitive provider text',
      'never-log-this-key',
      'never-log-this-token',
      'private@example.test',
      'private prompt',
    ])
      expect(lines[0]).not.toContain(value);
  });
});

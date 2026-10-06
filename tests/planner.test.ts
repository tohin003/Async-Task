import { describe, expect, it } from 'vitest';
import { demoBundle, demoProposal } from '../src/lib/demo';
import { createDataset } from '../src/lib/engine';
import {
  demoPlan,
  inspectDataset,
  inspectionSchema,
  runInspectionTool,
  validateLiveResult,
} from '../src/lib/planner';
import { livePlan } from '../src/lib/live-planner';
import type { ToolTrace } from '../src/lib/contracts';

const dataset = createDataset(demoBundle);
const inspection = inspectDataset(dataset);
describe('bounded planner', () => {
  it('uses all four inspection tools and proposes supported mappings', () => {
    const result = demoPlan(dataset);
    expect(result.trace.map((t) => t.tool)).toEqual([
      'inspect_schemas',
      'profile_source',
      'inspect_transformations',
      'validate_proposal',
    ]);
    expect(result.proposal.mappings).toHaveLength(8);
  });
  it('discloses aggregates without raw records or email values', () => {
    expect(inspectionSchema.safeParse(inspection).success).toBe(true);
    expect(JSON.stringify(inspection)).not.toContain('@example.com');
    expect(JSON.stringify(inspection)).not.toContain('Amelia');
    expect(inspection.profiles.find((p) => p.field === 'lifetime_value')?.missing).toBe(10);
    expect(
      inspection.profiles.find((p) => p.field === 'email_address')?.candidateIssues.email,
    ).toBe(4);
    expect(
      inspection.profiles.find((p) => p.field === 'signup_date')?.candidateIssues.isoDate,
    ).toBe(3);
    expect(
      inspection.profiles.find((p) => p.field === 'lifetime_value')?.candidateIssues.decimal,
    ).toBe(2);
    expect(
      inspection.profiles.find((p) => p.field === 'marketing_opt_in')?.candidateIssues.boolean,
    ).toBe(1);
  });
  it('blocks mutation tools and arbitrary arguments', () => {
    const trace: ToolTrace[] = [];
    for (const tool of ['execute', 'approve', 'rollback', 'fetch', 'eval'])
      expect(() => runInspectionTool(tool, {}, inspection, trace)).toThrow('allowlist');
    expect(() =>
      runInspectionTool('inspect_schemas', { url: 'https://evil.com' }, inspection, trace),
    ).toThrow('no arguments');
    expect(trace.every((t) => t.status === 'blocked')).toBe(true);
  });
  it('does not allow the AI to resolve clarifications or fabricate fields', () => {
    const p = structuredClone(demoProposal);
    p.questions[0].resolution = 'AI approves';
    expect(() => validateLiveResult(p, inspection, [])).toThrow('cannot resolve');
    p.questions[0].resolution = null;
    p.mappings[0].source = 'fake';
    expect(() => validateLiveResult(p, inspection, [])).toThrow('does not exist');
  });
  it('makes missing required fields explicit instead of inventing them', () => {
    const d = createDataset({
      name: 'Custom',
      sourceSchema: {
        name: 'source',
        primaryKey: 'id',
        fields: [{ name: 'id', type: 'string', required: true }],
      },
      targetSchema: {
        name: 'target',
        primaryKey: 'id',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'mandatory', type: 'string', required: true },
        ],
      },
      records: [{ id: 'one' }],
    });
    const p = demoPlan(d).proposal;
    expect(p.mappings[1].source).toBeNull();
    expect(p.questions[0].blocking).toBe(true);
  });
  it('rejects inconsistent aggregate profiles', () => {
    const invalid = structuredClone(inspection);
    invalid.profiles[0].total = 999;
    expect(inspectionSchema.safeParse(invalid).success).toBe(false);
  });
  it('provides safe categorical evidence without names or contact values', () => {
    expect(
      inspection.profiles
        .find((p) => p.field === 'account_status')
        ?.categories.map((c) => c.value)
        .sort(),
    ).toEqual(['disabled', 'enabled', 'hold']);
    expect(inspection.profiles.find((p) => p.field === 'full_name')?.categories).toEqual([]);
    expect(inspection.profiles.find((p) => p.field === 'email_address')?.categories).toEqual([]);
  });
  it('blocks invented enum lookups and silent default business decisions', () => {
    const proposal = structuredClone(demoProposal);
    proposal.mappings.find((m) => m.target === 'status')!.transforms = [
      { op: 'enum_map', arg: '{"active":"active","inactive":"inactive","paused":"paused"}' },
    ];
    expect(() => runInspectionTool('validate_proposal', { proposal }, inspection, [])).toThrow(
      'observed categorical values',
    );
    proposal.mappings = structuredClone(demoProposal.mappings);
    proposal.questions = [];
    expect(() => runInspectionTool('validate_proposal', { proposal }, inspection, [])).toThrow(
      'blocking user clarification',
    );
  });
  it('surfaces provider failure without silently falling back', async () => {
    const fetcher = (async () => new Response('', { status: 429 })) as typeof fetch;
    await expect(livePlan(inspection, 'test', 'test', fetcher)).rejects.toThrow('429');
  });
  it('runs an actual bounded tool loop and validates the final provider response', async () => {
    let round = 0;
    const tools = [
      'inspect_schemas',
      'profile_source',
      'inspect_transformations',
      'validate_proposal',
    ];
    const fetcher = (async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.store).toBe(false);
      expect(body.tools).toHaveLength(4);
      const current = round++;
      return new Response(
        JSON.stringify({
          status: 'completed',
          output:
            current < 4
              ? [
                  {
                    type: 'function_call',
                    name: tools[current],
                    call_id: `call-${current}`,
                    arguments: JSON.stringify(current === 3 ? { proposal: demoProposal } : {}),
                  },
                ]
              : [
                  {
                    type: 'message',
                    content: [{ type: 'output_text', text: JSON.stringify(demoProposal) }],
                  },
                ],
        }),
      );
    }) as typeof fetch;
    const result = await livePlan(inspection, 'test', 'test', fetcher);
    expect(result.provider).toBe('live');
    expect(result.trace).toHaveLength(5);
  });
});

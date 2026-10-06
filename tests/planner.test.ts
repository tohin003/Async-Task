import { describe, expect, it, vi } from 'vitest';
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
import { PLANNER_DEADLINE_MS } from '../src/lib/planner-limits';
import type { ToolTrace } from '../src/lib/contracts';
import type { PlannerStep } from '../src/lib/planner-logs';

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
    expect(inspection.profiles.find((p) => p.field === 'email_address')?.whitespace).toBe(116);
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
  it('blocks omitted normalization when aggregate evidence requires trim', () => {
    const proposal = structuredClone(demoProposal);
    proposal.mappings.find((m) => m.target === 'email')!.transforms = [
      { op: 'lowercase', arg: null },
    ];
    expect(() => runInspectionTool('validate_proposal', { proposal }, inspection, [])).toThrow(
      'Add trim',
    );
    proposal.mappings
      .find((m) => m.target === 'email')!
      .transforms.unshift({ op: 'trim', arg: null });
    expect(runInspectionTool('validate_proposal', { proposal }, inspection, [])).toMatchObject({
      valid: true,
    });
  });
  it('blocks string enum outputs for a boolean target and accepts typed booleans', () => {
    const proposal = structuredClone(demoProposal);
    const mapping = proposal.mappings.find((m) => m.target === 'subscribed')!;
    mapping.transforms = [{ op: 'enum_map', arg: '{"yes":"true","no":"false","maybe":null}' }];
    proposal.questions.push({
      id: 'confirm-consent',
      target: 'subscribed',
      question: 'Confirm explicit yes/no consent conversion?',
      blocking: true,
      resolution: null,
    });
    expect(() => runInspectionTool('validate_proposal', { proposal }, inspection, [])).toThrow(
      'boolean outputs must be unquoted',
    );
    mapping.transforms = [{ op: 'enum_map', arg: '{"yes":true,"no":false}' }];
    expect(runInspectionTool('validate_proposal', { proposal }, inspection, [])).toMatchObject({
      valid: true,
    });
  });
  it('surfaces provider failure without silently falling back', async () => {
    const fetcher = (async () => new Response('', { status: 429 })) as typeof fetch;
    await expect(livePlan(inspection, 'test', 'test', fetcher)).rejects.toThrow('429');
  });
  it('aborts a stalled provider request at the bounded deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = (async (_url: unknown, init: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('Timed out', 'AbortError')),
            { once: true },
          );
        })) as typeof fetch;
      const result = livePlan(inspection, 'test', 'test', fetcher);
      const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(PLANNER_DEADLINE_MS);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('runs an actual bounded tool loop and validates the final provider response', async () => {
    let round = 0;
    const observed: PlannerStep[] = [];
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
      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.strict).toBe(true);
      expect(body.text.format.schema.properties.mappings.items.properties.target.enum).toEqual(
        inspection.targetSchema.fields.map((field) => field.name),
      );
      expect(body.text.format.schema.properties.risks.items.properties.field.enum).not.toContain(
        'customer_id',
      );
      expect(body.text.format.schema.properties.questions.items.properties.resolution.type).toBe(
        'null',
      );
      expect(
        body.tools.find((tool: { name: string }) => tool.name === 'validate_proposal').parameters
          .properties.proposal,
      ).toEqual(body.text.format.schema);
      expect(body.temperature).toBe(0);
      const current = round++;
      expect(body.tool_choice).toEqual(
        current < 3 ? 'required' : { type: 'function', name: 'validate_proposal' },
      );
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
    const result = await livePlan(inspection, 'test', 'gpt-4.1-mini', fetcher, (step) =>
      observed.push(step),
    );
    expect(result.provider).toBe('live');
    expect(result.trace).toHaveLength(5);
    expect(
      observed.filter((step) => step.event === 'tool.completed').map((step) => step.tool),
    ).toEqual(tools);
    expect(observed.filter((step) => step.event === 'provider.round')).toHaveLength(4);
  });
  it('preserves bounded inspection evidence when repeated invalid proposals exhaust the loop', async () => {
    let round = 0;
    const invalid = structuredClone(demoProposal);
    invalid.mappings[0].source = 'nonexistent_source';
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          output:
            round++ === 0
              ? ['inspect_schemas', 'profile_source', 'inspect_transformations'].map((name, i) => ({
                  type: 'function_call',
                  name,
                  call_id: `inspect-${i}`,
                  arguments: '{}',
                }))
              : [
                  {
                    type: 'function_call',
                    name: 'validate_proposal',
                    call_id: `validate-${round}`,
                    arguments: JSON.stringify({ proposal: invalid }),
                  },
                ],
        }),
      )) as typeof fetch;
    await expect(livePlan(inspection, 'test', 'test', fetcher)).rejects.toMatchObject({
      message: expect.stringContaining('seven-round budget'),
      planningTrace: expect.arrayContaining([
        expect.objectContaining({ tool: 'validate_proposal', status: 'blocked' }),
      ]),
    });
    expect(round).toBe(7);
  });
  it('accepts only the exact wrapped final proposal after inspection', async () => {
    let round = 0;
    const tools = ['inspect_schemas', 'profile_source', 'inspect_transformations'];
    const fetcher = (async () => {
      const current = round++;
      return new Response(
        JSON.stringify({
          status: 'completed',
          output:
            current < 3
              ? [
                  {
                    type: 'function_call',
                    name: tools[current],
                    call_id: `call-${current}`,
                    arguments: '{}',
                  },
                ]
              : [
                  {
                    type: 'message',
                    content: [
                      { type: 'output_text', text: JSON.stringify({ proposal: demoProposal }) },
                    ],
                  },
                ],
        }),
      );
    }) as typeof fetch;
    expect((await livePlan(inspection, 'test', 'test', fetcher)).proposal).toEqual(demoProposal);
  });
  it('repairs invalid final output within its fixed round budget', async () => {
    let round = 0;
    const tools = ['inspect_schemas', 'profile_source', 'inspect_transformations'];
    const fetcher = (async (_url: unknown, init: RequestInit) => {
      const current = round++;
      const body = JSON.parse(init.body as string);
      if (current === 4)
        expect(body.input.at(-1).content).toContain('failed application validation');
      return new Response(
        JSON.stringify({
          status: 'completed',
          output:
            current < 3
              ? [
                  {
                    type: 'function_call',
                    name: tools[current],
                    call_id: `call-${current}`,
                    arguments: '{}',
                  },
                ]
              : [
                  {
                    type: 'message',
                    content: [
                      {
                        type: 'output_text',
                        text: JSON.stringify(current === 3 ? { wrong: true } : demoProposal),
                      },
                    ],
                  },
                ],
        }),
      );
    }) as typeof fetch;
    expect((await livePlan(inspection, 'test', 'test', fetcher)).provider).toBe('live');
    expect(round).toBe(5);
  });
});

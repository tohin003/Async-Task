import { describe, expect, it } from 'vitest';
import { bundleSchema, LIMITS } from '../src/lib/contracts';
import { demoBundle, demoProposal } from '../src/lib/demo';
import {
  applyTransform,
  createDataset,
  parseDefault,
  parseEnumMap,
  planFingerprint,
  runDryRun,
  validateProposal,
  validateValue,
} from '../src/lib/engine';
import { applyCommand, emptyWorkspace, reconcile } from '../src/lib/lifecycle';
import { validateStoredWorkspace } from '../src/lib/store';

function ready() {
  const dataset = createDataset(demoBundle);
  const p = structuredClone(demoProposal);
  p.questions.forEach((q) => (q.resolution = 'Confirmed'));
  let w = applyCommand(emptyWorkspace(dataset), {
    type: 'plan',
    proposal: p,
    provider: 'manual',
    trace: [],
    datasetId: dataset.id,
  });
  w = applyCommand(w, { type: 'dry_run', planId: 'plan-1' });
  return applyCommand(w, {
    type: 'approve',
    planId: 'plan-1',
    reviewer: 'Reviewer',
    note: '',
    expectedDigest: w.dryRuns['plan-1'].digest,
  });
}
describe('bounded input contracts', () => {
  it('rejects over-limit samples, nested values and undeclared fields', () => {
    expect(
      bundleSchema.safeParse({
        ...demoBundle,
        records: Array.from({ length: LIMITS.records + 1 }, () => demoBundle.records[0]),
      }).success,
    ).toBe(false);
    expect(
      bundleSchema.safeParse({
        ...demoBundle,
        records: [{ ...demoBundle.records[0], full_name: { nested: true } }],
      }).success,
    ).toBe(false);
    expect(
      bundleSchema.safeParse({
        ...demoBundle,
        records: [{ ...demoBundle.records[0], undeclared: 'x' }],
      }).success,
    ).toBe(false);
  });
  it('rejects invalid primary keys and duplicate field names', () => {
    expect(
      bundleSchema.safeParse({
        ...demoBundle,
        targetSchema: { ...demoBundle.targetSchema, primaryKey: 'missing' },
      }).success,
    ).toBe(false);
    expect(
      bundleSchema.safeParse({
        ...demoBundle,
        targetSchema: {
          ...demoBundle.targetSchema,
          fields: [...demoBundle.targetSchema.fields, demoBundle.targetSchema.fields[0]],
        },
      }).success,
    ).toBe(false);
  });
  it('accepts exactly the documented maximum sample', () => {
    expect(
      bundleSchema.safeParse({
        ...demoBundle,
        records: Array.from({ length: LIMITS.records }, (_, i) => ({
          ...demoBundle.records[0],
          customer_id: `ID-${i}`,
        })),
      }).success,
    ).toBe(true);
  });
});
describe('finite transformation boundary', () => {
  it('normalizes strings without mutating originals', () => {
    expect(applyTransform(' Test ', { op: 'trim', arg: null })).toBe('Test');
    expect(applyTransform('Test', { op: 'lowercase', arg: null })).toBe('test');
    expect(applyTransform('Test', { op: 'uppercase', arg: null })).toBe('TEST');
  });
  it('fills only missing values and rejects non-finite or structured arguments', () => {
    expect(applyTransform(null, { op: 'default', arg: '0' })).toBe(0);
    expect(applyTransform(false, { op: 'default', arg: 'true' })).toBe(false);
    expect(applyTransform(0, { op: 'default', arg: '12' })).toBe(0);
    for (const arg of ['[]', '{}', '1e999', 'undefined']) expect(() => parseDefault(arg)).toThrow();
    expect(() => parseEnumMap('{"x":1e999}')).toThrow();
  });
  it('rejects unknown enum values, fractional integers, overflow and wrong pipeline types', () => {
    expect(() =>
      applyTransform('unknown', { op: 'enum_map', arg: '{"active":"enabled"}' }),
    ).toThrow();
    expect(() => applyTransform('9007199254740992', { op: 'to_integer', arg: null })).toThrow();
    expect(() => applyTransform(Number.MAX_VALUE, { op: 'multiply', arg: '100' })).toThrow();
    expect(() => applyTransform(1, { op: 'lowercase', arg: null })).toThrow();
    expect(applyTransform(null, { op: 'to_boolean', arg: null })).toBeNull();
  });
  it('enforces enum, range and string length constraints', () => {
    expect(
      validateValue(-1, { name: 'amount', type: 'number', required: true, unique: false, min: 0 })
        ?.code,
    ).toBe('BELOW_MIN');
    expect(
      validateValue('long', { name: 'code', type: 'string', required: true, unique: false, max: 2 })
        ?.code,
    ).toBe('ABOVE_MAX');
    expect(
      validateValue('unknown', {
        name: 'status',
        type: 'enum',
        required: true,
        unique: false,
        values: ['active'],
      })?.code,
    ).toBe('INVALID_ENUM');
  });
  it('does not let invalid rows consume a unique identifier', () => {
    const bundle = structuredClone(demoBundle);
    bundle.records = [
      bundle.records[8],
      { ...bundle.records[0], customer_id: bundle.records[8].customer_id },
    ];
    const dataset = createDataset(bundle);
    const w = applyCommand(emptyWorkspace(dataset), {
      type: 'plan',
      proposal: demoProposal,
      provider: 'demo',
      trace: [],
      datasetId: dataset.id,
    });
    const run = runDryRun(dataset, w.plans[0]);
    expect(run.rows[0].accepted).toBe(false);
    expect(run.rows[1].accepted).toBe(true);
  });
  it('rejects omitted target mappings, duplicate mappings and malformed rule arguments', () => {
    expect(() =>
      validateProposal({ ...demoProposal, mappings: demoProposal.mappings.slice(1) }, demoBundle),
    ).toThrow('explicit mapping');
    expect(() =>
      validateProposal(
        { ...demoProposal, mappings: [...demoProposal.mappings, demoProposal.mappings[0]] },
        demoBundle,
      ),
    ).toThrow('twice');
    const p = structuredClone(demoProposal);
    p.mappings[0].transforms = [{ op: 'trim', arg: 'unexpected' }];
    expect(() => validateProposal(p, demoBundle)).toThrow('no argument');
  });
});
describe('migration invariants under adverse state', () => {
  it('enforces user-only clarification decisions in the domain layer', () => {
    const w = ready();
    const proposal = structuredClone(demoProposal);
    proposal.questions[0].resolution = 'The AI approves';
    expect(() =>
      applyCommand(w, {
        type: 'plan',
        proposal,
        provider: 'live',
        trace: [],
        datasetId: w.dataset.id,
      }),
    ).toThrow('cannot resolve');
  });
  it('binds all reviewed risk evidence into the plan fingerprint', () => {
    const w = ready();
    const p = structuredClone(demoProposal);
    p.risks[0].message = 'Modified risk';
    expect(planFingerprint(w.dataset, p)).not.toBe(planFingerprint(w.dataset, demoProposal));
  });
  it('refuses a drifted approval and does not mutate the caller state', () => {
    const w = ready();
    w.approvals['plan-1'].dryRunDigest = 'changed';
    const before = structuredClone(w);
    expect(() => applyCommand(w, { type: 'execute', planId: 'plan-1' })).toThrow(
      'Approval no longer matches',
    );
    expect(w).toEqual(before);
  });
  it('records unique-field conflicts without any partial writes', () => {
    const w = ready();
    const first = w.dryRuns['plan-1'].rows[0].transformed;
    w.target.push({
      key: 'other-key',
      planId: 'other',
      executionId: 'other',
      digest: 'other',
      data: { ...first, id: 'other' },
    });
    const result = applyCommand(w, { type: 'execute', planId: 'plan-1' });
    expect(result.target).toHaveLength(1);
    expect(result.executions[0].status).toBe('failed');
    expect(result.executions[0].error).toContain('Unique target field');
  });
  it('detects missing and unexpected target rows separately', () => {
    const w = applyCommand(ready(), { type: 'execute', planId: 'plan-1' });
    w.target.pop();
    w.target.push({
      key: 'unexpected',
      data: { id: 'unexpected' },
      digest: 'x',
      planId: 'plan-1',
      executionId: 'x',
    });
    const report = reconcile(w, 'plan-1');
    expect(report.target).toBe(108);
    expect(report.missing).toHaveLength(1);
    expect(report.unexpected).toHaveLength(1);
    expect(report.status).toBe('Mismatch');
  });
  it('preserves old dataset versions when loading a new bounded source', () => {
    const w = ready();
    const nextBundle = {
      ...demoBundle,
      name: 'New source',
      records: demoBundle.records.slice(0, 1),
    };
    const next = applyCommand(w, { type: 'dataset', bundle: nextBundle });
    expect(next.datasets).toHaveLength(2);
    expect(next.plans).toHaveLength(1);
    expect(() => applyCommand(next, { type: 'execute', planId: 'plan-1' })).toThrow(
      'previous dataset',
    );
  });
  it('rejects a stale asynchronous proposal after dataset replacement', () => {
    const w = ready();
    const next = applyCommand(w, {
      type: 'dataset',
      bundle: { ...demoBundle, name: 'New source' },
    });
    expect(() =>
      applyCommand(next, {
        type: 'plan',
        proposal: demoProposal,
        provider: 'live',
        trace: [],
        datasetId: w.dataset.id,
      }),
    ).toThrow('changed while planning');
  });
  it('fails visibly on corrupt persistence instead of silently resetting history', () => {
    expect(() => validateStoredWorkspace({ format: 99 })).toThrow('damaged');
    const w = ready();
    w.datasets[0].records[0].full_name = 'Tampered';
    expect(() => validateStoredWorkspace(w)).toThrow('integrity');
  });
  it('requires an actual dry run and a reviewer for approval', () => {
    const w = ready();
    delete w.approvals['plan-1'];
    expect(() =>
      applyCommand(w, {
        type: 'approve',
        planId: 'plan-1',
        reviewer: '',
        note: '',
        expectedDigest: w.dryRuns['plan-1'].digest,
      }),
    ).toThrow('reviewer');
    delete w.dryRuns['plan-1'];
    expect(() =>
      applyCommand(w, {
        type: 'approve',
        planId: 'plan-1',
        reviewer: 'Judge',
        note: '',
        expectedDigest: 'x',
      }),
    ).toThrow('validation');
  });
  it('blocks a zero-accepted-row plan', () => {
    const w = ready();
    const p = structuredClone(demoProposal);
    p.questions.forEach((q) => (q.resolution = 'Reviewed'));
    p.mappings[0].source = null;
    let next = applyCommand(w, {
      type: 'plan',
      proposal: p,
      provider: 'manual',
      trace: [],
      datasetId: w.dataset.id,
    });
    next = applyCommand(next, { type: 'dry_run', planId: 'plan-2' });
    expect(() =>
      applyCommand(next, {
        type: 'approve',
        planId: 'plan-2',
        reviewer: 'Judge',
        note: '',
        expectedDigest: next.dryRuns['plan-2'].digest,
      }),
    ).toThrow('no accepted');
  });
});

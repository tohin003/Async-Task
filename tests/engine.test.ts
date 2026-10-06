import { describe, expect, it } from 'vitest';
import { demoBundle, demoProposal } from '../src/lib/demo';
import {
  applyTransform,
  createDataset,
  runDryRun,
  validateProposal,
  validDate,
} from '../src/lib/engine';
import { applyCommand, emptyWorkspace, reconcile, verifyHistory } from '../src/lib/lifecycle';
import { fingerprint } from '../src/lib/hash';

const now = '2026-10-06T10:00:00Z';
function prepared() {
  let w = emptyWorkspace(createDataset(demoBundle, now), now);
  const p = structuredClone(demoProposal);
  p.questions.forEach((q) => {
    q.resolution = 'Confirmed by reviewer.';
  });
  w = applyCommand(
    w,
    { type: 'plan', proposal: p, provider: 'demo', trace: [], datasetId: w.dataset.id },
    now,
  );
  return applyCommand(w, { type: 'dry_run', planId: 'plan-1' }, now);
}
function approved() {
  const w = prepared();
  return applyCommand(
    w,
    {
      type: 'approve',
      planId: 'plan-1',
      reviewer: 'Judge',
      note: '',
      expectedDigest: w.dryRuns['plan-1'].digest,
    },
    now,
  );
}
describe('deterministic engine', () => {
  it('accounts for every demo row with preserved error evidence', () => {
    const w = prepared();
    const r = w.dryRuns['plan-1'];
    expect([r.source, r.transformed, r.accepted, r.rejected]).toEqual([120, 120, 108, 12]);
    expect(r.rows[8].errors[0]).toMatchObject({
      field: 'email',
      original: 'invalid-email',
      transformed: 'invalid-email',
      code: 'INVALID_EMAIL',
    });
    expect(r.rows[99].errors[0].code).toBe('DUPLICATE_VALUE');
    expect(runDryRun(w.dataset, w.plans[0], '2030-01-01').digest).toBe(r.digest);
  });
  it('does not guess dates, truncate fractions or parse currency', () => {
    expect(validDate('2024-02-29')).toBe(true);
    expect(validDate('2025-02-29')).toBe(false);
    for (const v of ['12x', '$12', '', '1,200', 'Infinity'])
      expect(() => applyTransform(v, { op: 'to_number', arg: null })).toThrow();
    expect(() => applyTransform('1.5', { op: 'to_integer', arg: null })).toThrow();
    expect(() => applyTransform('maybe', { op: 'to_boolean', arg: null })).toThrow();
  });
  it('rejects fabricated fields, omitted mappings, unsupported transforms and unsafe enum maps', () => {
    const p = structuredClone(demoProposal);
    p.mappings[0].source = 'imaginary';
    expect(() => validateProposal(p, demoBundle)).toThrow('does not exist');
    expect(() => validateProposal({ ...demoProposal, mappings: [] }, demoBundle)).toThrow();
    expect(() => applyTransform('x', { op: 'enum_map', arg: '{"__proto__":"x"}' })).toThrow();
    expect(() =>
      validateProposal(
        {
          ...demoProposal,
          mappings: demoProposal.mappings.map((m) => ({
            ...m,
            transforms: [{ op: 'eval', arg: 'x' }],
          })),
        },
        demoBundle,
      ),
    ).toThrow();
  });
  it('canonical fingerprints ignore object key insertion order', () =>
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 })));
});
describe('approval and migration lifecycle', () => {
  it('refuses unapproved execution and unresolved clarifications', () => {
    const w = prepared();
    expect(() => applyCommand(w, { type: 'execute', planId: 'plan-1' })).toThrow('approval');
    let blocked = emptyWorkspace(createDataset(demoBundle));
    blocked = applyCommand(blocked, {
      type: 'plan',
      proposal: demoProposal,
      provider: 'demo',
      trace: [],
      datasetId: blocked.dataset.id,
    });
    blocked = applyCommand(blocked, { type: 'dry_run', planId: 'plan-1' });
    expect(() =>
      applyCommand(blocked, {
        type: 'approve',
        planId: 'plan-1',
        reviewer: 'Judge',
        note: '',
        expectedDigest: blocked.dryRuns['plan-1'].digest,
      }),
    ).toThrow('clarifications');
  });
  it('inserts once, retries without duplicates, and balances source against target and quarantine', () => {
    const w = applyCommand(approved(), { type: 'execute', planId: 'plan-1' }, now);
    const retry = applyCommand(w, { type: 'execute', planId: 'plan-1' }, now);
    expect(retry.target).toHaveLength(108);
    expect(retry.executions[1]).toMatchObject({ inserted: 0, skipped: 108, attempt: 2 });
    expect(reconcile(retry, 'plan-1')).toMatchObject({
      source: 120,
      matched: 108,
      rejected: 12,
      status: 'Balanced',
    });
    expect(verifyHistory(retry.events)).toBe(true);
  });
  it('rolls back only owned rows, keeps all history, and blocks replay of rolled-back approval', () => {
    const w = applyCommand(approved(), { type: 'execute', planId: 'plan-1' }, now);
    w.target.push({
      key: 'other',
      data: { id: 'other' },
      planId: 'other',
      executionId: 'external',
      digest: 'x',
    });
    const rolled = applyCommand(
      w,
      { type: 'rollback', planId: 'plan-1', reviewer: 'Judge', reason: 'Demo complete' },
      now,
    );
    expect(rolled.target).toHaveLength(1);
    expect(rolled.events).toHaveLength(w.events.length + 1);
    expect(rolled.approvals['plan-1']).toBeDefined();
    expect(() => applyCommand(rolled, { type: 'execute', planId: 'plan-1' })).toThrow(
      'rolled back',
    );
  });
  it('aborts all inserts on collision and records a failed attempt', () => {
    const w = approved();
    w.target.push({
      key: '"CUS-0002"',
      data: { id: 'CUS-0002' },
      planId: 'other',
      executionId: 'external',
      digest: 'x',
    });
    const result = applyCommand(w, { type: 'execute', planId: 'plan-1' }, now);
    expect(result.target).toHaveLength(1);
    expect(result.executions[0]).toMatchObject({ status: 'failed', inserted: 0 });
  });
  it('edits produce a new version without inheriting approval', () => {
    const w = approved();
    const p = structuredClone(demoProposal);
    p.mappings[1].transforms.push({ op: 'uppercase', arg: null });
    const edited = applyCommand(
      w,
      { type: 'plan', proposal: p, provider: 'manual', trace: [], datasetId: w.dataset.id },
      now,
    );
    expect(edited.plans[0].fingerprint).not.toBe(edited.plans[1].fingerprint);
    expect(edited.approvals['plan-2']).toBeUndefined();
    expect(() => applyCommand(edited, { type: 'execute', planId: 'plan-2' })).toThrow('approval');
  });
  it('detects modified content even when source and target totals match', () => {
    const w = applyCommand(approved(), { type: 'execute', planId: 'plan-1' }, now);
    w.target[0].data.name = 'Corrupted';
    expect(reconcile(w, 'plan-1').drifted).toHaveLength(1);
    expect(reconcile(w, 'plan-1').status).toBe('Mismatch');
  });
  it('blocks stale digests, tampered plans and history', () => {
    const w = prepared();
    expect(() =>
      applyCommand(w, {
        type: 'approve',
        planId: 'plan-1',
        reviewer: 'Judge',
        note: '',
        expectedDigest: 'wrong',
      }),
    ).toThrow('changed');
    w.plans[0].mappings[0].source = 'country';
    expect(() => runDryRun(w.dataset, w.plans[0])).toThrow('fingerprint');
    w.events[0].detail = 'tampered';
    expect(verifyHistory(w.events)).toBe(false);
    expect(() => applyCommand(w, { type: 'dry_run', planId: 'plan-1' })).toThrow('integrity');
  });
});

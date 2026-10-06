import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dispatch, loadWorkspace, resetWorkspace } from '../src/lib/store';
import { demoProposal } from '../src/lib/demo';

describe('atomic mock target persistence', () => {
  it('serializes simultaneous retries without inserting duplicates and preserves reload', async () => {
    const w = await resetWorkspace();
    const p = structuredClone(demoProposal);
    p.questions.forEach((q) => (q.resolution = 'Confirmed'));
    await dispatch({
      type: 'plan',
      proposal: p,
      provider: 'manual',
      trace: [],
      datasetId: w.dataset.id,
    });
    const ready = await dispatch({ type: 'dry_run', planId: 'plan-2' });
    await dispatch({
      type: 'approve',
      planId: 'plan-2',
      reviewer: 'Judge',
      note: '',
      expectedDigest: ready.dryRuns['plan-2'].digest,
    });
    await Promise.all([
      dispatch({ type: 'execute', planId: 'plan-2' }),
      dispatch({ type: 'execute', planId: 'plan-2' }),
    ]);
    const loaded = await loadWorkspace();
    expect(loaded.target).toHaveLength(108);
    expect(loaded.executions.map((e) => e.inserted)).toEqual([108, 0]);
    expect(loaded.executions[1].skipped).toBe(108);
    await expect(dispatch({ type: 'dataset', bundle: loaded.dataset })).rejects.toThrow();
    expect((await loadWorkspace()).target).toHaveLength(108);
  });
});

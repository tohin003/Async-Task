import { DomainError, LIMITS, type Approval, type AuditEvent, type Bundle, type Dataset, type Plan, type Proposal, type ToolTrace, type Workspace } from './contracts';
import { createDataset, planFingerprint, proposalOf, runDryRun, validateProposal } from './engine';
import { canonical, fingerprint } from './hash';

export type Command =
  | { type: 'plan'; proposal: Proposal; provider: Plan['provider']; trace: ToolTrace[]; datasetId: string }
  | { type: 'dry_run'; planId: string }
  | { type: 'approve'; planId: string; reviewer: string; note: string; expectedDigest: string }
  | { type: 'execute'; planId: string }
  | { type: 'rollback'; planId: string; reviewer: string; reason: string }
  | { type: 'dataset'; bundle: Bundle }
  | { type: 'reconcile'; planId: string };

function reject(code: string, message: string): never { throw new DomainError(code, message); }
export function addEvent(w: Workspace, type: AuditEvent['type'], planId: string | null, actor: string, detail: string, now: string): void {
  const previousHash = w.events.at(-1)?.hash ?? 'genesis';
  const event = { id: `event-${w.events.length + 1}`, type, planId, actor, detail, createdAt: now, previousHash };
  w.events.push({ ...event, hash: fingerprint(event) });
}
export function verifyHistory(events: AuditEvent[]): boolean {
  let previous = 'genesis';
  for (const e of events) { const { hash, ...body } = e; if (body.previousHash !== previous || fingerprint(body) !== hash) return false; previous = hash; }
  return true;
}
export function emptyWorkspace(dataset: Dataset, now = new Date().toISOString()): Workspace {
  const w: Workspace = { format: 1, revision: 0, dataset, datasets: [dataset], plans: [], dryRuns: {}, approvals: {}, executions: [], target: [], events: [] };
  addEvent(w, 'dataset', null, 'User', `Loaded ${dataset.name}: ${dataset.records.length} source records.`, now);
  return w;
}
export function getDataset(w: Workspace, plan: Plan): Dataset {
  return w.datasets.find(d => d.id === plan.datasetId) ?? reject('MISSING_DATASET', 'The plan dataset is unavailable');
}
export function getPlan(w: Workspace, id: string): Plan { return w.plans.find(p => p.id === id) ?? reject('MISSING_PLAN', 'Plan version does not exist'); }
export function applyCommand(current: Workspace, command: Command, now = new Date().toISOString()): Workspace {
  const w = structuredClone(current);
  if (!verifyHistory(w.events)) reject('HISTORY_CORRUPT', 'History integrity check failed. Export the workspace for inspection.');
  switch (command.type) {
    case 'plan': {
      if (command.datasetId !== w.dataset.id) reject('STALE_DATASET', 'Dataset changed while planning. Inspect the current source and try again.');
      if (w.plans.length >= LIMITS.versions) reject('VERSION_LIMIT', `This workspace supports at most ${LIMITS.versions} plan versions.`);
      const proposal = validateProposal(proposalOf(command.proposal), w.dataset);
      const version = w.plans.length + 1;
      const plan: Plan = { ...proposal, id: `plan-${version}`, version, datasetId: w.dataset.id, fingerprint: planFingerprint(w.dataset, proposal), createdAt: now, provider: command.provider, trace: command.trace };
      w.plans.push(plan);
      addEvent(w, 'plan', plan.id, command.provider === 'manual' ? 'User' : `${command.provider === 'live' ? 'AI' : 'Demo'} planner`, `Created immutable mapping plan v${version} with ${plan.mappings.length} field mappings.`, now);
      break;
    }
    case 'dataset': {
      if (w.target.length) reject('TARGET_NOT_EMPTY', 'Roll back the active migration before replacing the dataset.');
      const dataset = createDataset(command.bundle, now);
      w.dataset = dataset;
      if (!w.datasets.some(d => d.id === dataset.id)) w.datasets.push(dataset);
      addEvent(w, 'dataset', null, 'User', `Loaded ${dataset.name}: ${dataset.records.length} source records. Previous versions and history retained.`, now);
      break;
    }
    case 'dry_run': {
      const plan = getPlan(w, command.planId);
      const result = runDryRun(getDataset(w, plan), plan, now);
      w.dryRuns[plan.id] = result;
      addEvent(w, 'dry_run', plan.id, 'Validation engine', `${result.source} source → ${result.transformed} transformed → ${result.accepted} accepted · ${result.rejected} quarantined. Digest ${result.digest.slice(0, 12)}.`, now);
      break;
    }
    case 'approve': {
      const plan = getPlan(w, command.planId);
      if (plan.datasetId !== w.dataset.id) reject('STALE_DATASET', 'Only the current dataset can be approved.');
      if (w.approvals[plan.id]) reject('ALREADY_APPROVED', 'This exact plan is already approved.');
      const run = w.dryRuns[plan.id];
      if (!run) reject('DRY_RUN_REQUIRED', 'Run deterministic validation before approving.');
      if (run.digest !== command.expectedDigest || run.digest !== runDryRun(getDataset(w, plan), plan, now).digest) reject('STALE_DRY_RUN', 'Dry-run evidence changed. Review the current result.');
      if (!command.reviewer.trim() || command.reviewer.length > 80 || command.note.length > 1000) reject('REVIEWER_REQUIRED', 'Enter a reviewer name (at most 80 characters).');
      if (plan.questions.some(q => q.blocking && !q.resolution?.trim())) reject('UNRESOLVED_QUESTION', 'Resolve blocking clarifications in a new plan version first.');
      if (run.accepted === 0) reject('NO_VALID_ROWS', 'A plan with no accepted records cannot execute.');
      const approval: Approval = { planId: plan.id, planFingerprint: plan.fingerprint, dryRunDigest: run.digest, reviewer: command.reviewer.trim(), note: command.note.trim(), createdAt: now };
      w.approvals[plan.id] = approval;
      addEvent(w, 'approval', plan.id, approval.reviewer, `Approved v${plan.version}: ${run.accepted} accepted, ${run.rejected} quarantined. ${approval.note || 'All mapping risks reviewed.'}`, now);
      break;
    }
    case 'execute': {
      const plan = getPlan(w, command.planId);
      const approval = w.approvals[plan.id];
      if (!approval) reject('APPROVAL_REQUIRED', 'Explicit user approval is required before execution.');
      if (plan.datasetId !== w.dataset.id) reject('STALE_DATASET', 'Cannot execute a plan for a previous dataset.');
      const previous = w.executions.filter(e => e.planId === plan.id);
      if (previous.some(e => e.status === 'rolled_back')) reject('ROLLED_BACK', 'This migration was rolled back. Create and approve a new version to migrate again.');
      const run = runDryRun(getDataset(w, plan), plan, now);
      if (approval.planFingerprint !== plan.fingerprint || approval.dryRunDigest !== run.digest) reject('STALE_APPROVAL', 'Approval no longer matches plan and dry-run evidence.');
      const id = `execution-${w.executions.length + 1}`;
      const pending: Workspace['target'] = [];
      let skipped = 0;
      let conflict: string | null = null;
      for (const row of run.rows.filter(r => r.accepted)) {
        const digest = fingerprint(row.transformed);
        const existing = w.target.find(t => t.key === row.key);
        if (existing) {
          if (existing.planId === plan.id && existing.digest === digest && fingerprint(existing.data) === digest) { skipped++; continue; }
          conflict = `Primary key ${row.key} already exists with different ownership or content. No rows inserted.`; break;
        }
        for (const field of getDataset(w, plan).targetSchema.fields.filter(f => f.unique)) {
          const v = row.transformed[field.name];
          if (v !== null && v !== '' && [...w.target, ...pending].some(t => canonical(t.data[field.name]) === canonical(v))) { conflict = `Unique target field ${field.name} conflicts for source row ${row.index + 1}. No rows inserted.`; break; }
        }
        if (conflict) break;
        pending.push({ key: row.key!, data: row.transformed, planId: plan.id, executionId: id, digest });
      }
      const attempt = previous.length + 1;
      w.executions.push({ id, planId: plan.id, attempt, inserted: conflict ? 0 : pending.length, skipped: conflict ? 0 : skipped, rejected: run.rejected, status: conflict ? 'failed' : 'committed', error: conflict, createdAt: now, rolledBackAt: null });
      if (!conflict) w.target.push(...pending);
      addEvent(w, attempt > 1 ? 'retry' : 'execution', plan.id, approval.reviewer, conflict ?? `Attempt ${attempt}: inserted ${pending.length}, skipped ${skipped} existing, quarantined ${run.rejected}. Atomic commit succeeded.`, now);
      break;
    }
    case 'rollback': {
      const plan = getPlan(w, command.planId);
      const executions = w.executions.filter(e => e.planId === plan.id && e.status === 'committed');
      if (!executions.length) reject('NOT_EXECUTED', 'No committed execution exists to roll back.');
      if (!command.reviewer.trim() || !command.reason.trim() || command.reviewer.length > 80 || command.reason.length > 1000) reject('REASON_REQUIRED', 'Provide a reviewer and rollback reason.');
      const removed = w.target.filter(t => t.planId === plan.id).length;
      w.target = w.target.filter(t => t.planId !== plan.id);
      for (const e of executions) { e.status = 'rolled_back'; e.rolledBackAt = now; }
      addEvent(w, 'rollback', plan.id, command.reviewer.trim(), `Removed ${removed} owned target rows. Reason: ${command.reason.trim()}. Approval and execution history retained.`, now);
      break;
    }
    case 'reconcile': {
      const report = reconcile(w, command.planId);
      addEvent(w, 'reconciliation', command.planId, 'Reconciliation engine', `Source ${report.source} = target ${report.matched} + quarantine ${report.rejected}; ${report.missing.length} missing, ${report.drifted.length} drifted, ${report.unexpected.length} unexpected. ${report.status}.`, now);
      break;
    }
  }
  w.revision++;
  return w;
}
export function reconcile(w: Workspace, planId: string) {
  const plan = getPlan(w, planId);
  const run = runDryRun(getDataset(w, plan), plan);
  const rows = w.target.filter(r => r.planId === planId);
  const expected = run.rows.filter(r => r.accepted);
  const missing = expected.filter(r => !rows.some(t => t.key === r.key)).map(r => r.key!);
  const drifted = expected.filter(r => { const t = rows.find(t => t.key === r.key); return t && fingerprint(t.data) !== fingerprint(r.transformed); }).map(r => r.key!);
  const unexpected = rows.filter(t => !expected.some(r => r.key === t.key)).map(r => r.key);
  const matched = expected.length - missing.length - drifted.length;
  const rolledBack = w.executions.some(e => e.planId === planId && e.status === 'rolled_back');
  const executed = w.executions.some(e => e.planId === planId && e.status === 'committed');
  return { source: run.source, transformed: run.transformed, accepted: run.accepted, rejected: run.rejected, target: rows.length, totalTarget: w.target.length, matched, missing, drifted, unexpected, status: rolledBack ? 'Rolled back' : !executed ? 'Not executed' : !missing.length && !drifted.length && !unexpected.length ? 'Balanced' : 'Mismatch' };
}

'use client';
import { useState } from 'react';
import { ShieldCheck, LockKeyhole, RotateCcw, Check } from 'lucide-react';
import type { DryRun, Plan, Workspace } from '@/lib/contracts';
import { Badge, Button, Modal } from './ui';

export function ApprovalDialog({
  plan,
  run,
  onApprove,
  onClose,
  busy,
}: {
  plan: Plan;
  run: DryRun;
  onApprove: (reviewer: string, note: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const blocking = plan.questions.filter((q) => q.blocking && !q.resolution?.trim());
  return (
    <Modal title="Approve migration plan" eyebrow="EXPLICIT APPROVAL REQUIRED" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed && reviewer.trim() && !blocking.length) onApprove(reviewer, note);
        }}
      >
        <div className="modal-body">
          <div className="approval-summary">
            <ShieldCheck size={24} />
            <div>
              <strong>Plan v{plan.version}</strong>
              <p>
                {run.accepted} accepted records · {run.rejected} records stay quarantined
              </p>
            </div>
            <Badge tone="blue">Exact version</Badge>
          </div>
          <div className="fingerprint-row">
            <span>Plan fingerprint</span>
            <code>{plan.fingerprint.slice(0, 24)}…</code>
          </div>
          <div className="fingerprint-row">
            <span>Validation digest</span>
            <code>{run.digest.slice(0, 24)}…</code>
          </div>
          {blocking.length > 0 && (
            <div className="error-message">
              Resolve {blocking.length} required clarifications before approval.
            </div>
          )}
          <label className="field-label">
            Reviewer name
            <input
              required
              autoComplete="name"
              placeholder="Your name"
              maxLength={80}
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <label className="field-label">
            Review note <span className="optional">optional</span>
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="Record the reasoning behind your approval…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I reviewed the mappings, risks and validation evidence. I approve this exact plan and
              accept that {run.rejected} invalid records will be quarantined.
            </span>
          </label>
          <div className="info-note">
            <LockKeyhole size={16} />
            <span>
              Approval is recorded in this local mock workspace. Execution is a separate action.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy || !reviewer.trim() || !confirmed || Boolean(blocking.length) || !run.accepted
            }
          >
            <Check size={16} />
            Approve plan v{plan.version}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function RollbackDialog({
  plan,
  workspace,
  onRollback,
  onClose,
  busy,
}: {
  plan: Plan;
  workspace: Workspace;
  onRollback: (reviewer: string, reason: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const owned = workspace.target.filter((r) => r.planId === plan.id).length;
  return (
    <Modal title="Roll back this migration" eyebrow="SCOPED MOCK ROLLBACK" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed) onRollback(reviewer, reason);
        }}
      >
        <div className="modal-body">
          <div className="warning-note">
            <RotateCcw size={20} />
            <span>
              This removes <strong>{owned} target rows</strong> owned by plan v{plan.version}. All
              approval, execution and retry history will remain available.
            </span>
          </div>
          <label className="field-label">
            Reviewer name
            <input
              required
              maxLength={80}
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <label className="field-label">
            Rollback reason
            <textarea
              required
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you reversing this mock migration?"
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I understand that migrating again requires a new approved plan version.</span>
          </label>
        </div>
        <div className="modal-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="danger"
            disabled={busy || !confirmed || !reviewer.trim() || !reason.trim()}
          >
            <RotateCcw size={15} />
            Confirm rollback
          </Button>
        </div>
      </form>
    </Modal>
  );
}

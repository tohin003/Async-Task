'use client';
import { useState } from 'react';
import { ArrowRight, Plus, Trash2, Save, GitBranch, CircleHelp } from 'lucide-react';
import {
  OPERATIONS,
  type Dataset,
  type Mapping,
  type Plan,
  type Proposal,
  type Transform,
} from '@/lib/contracts';
import { proposalOf, TRANSFORMATIONS } from '@/lib/engine';
import { Badge, Button, Modal } from './ui';

export function MappingEditor({
  mapping,
  dataset,
  onSave,
  onClose,
  busy,
}: {
  mapping: Mapping;
  dataset: Dataset;
  onSave: (mapping: Mapping) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Mapping>(structuredClone(mapping));
  const setRule = (i: number, transform: Transform) =>
    setDraft({
      ...draft,
      transforms: draft.transforms.map((t, index) => (i === index ? transform : t)),
    });
  return (
    <Modal title="Edit field mapping" eyebrow="NEW PLAN VERSION" onClose={onClose}>
      <div className="modal-body">
        <div className="mapping-preview">
          <code>{draft.source || 'No source'}</code>
          <ArrowRight size={18} />
          <code>{draft.target}</code>
        </div>
        <label className="field-label">
          Source field
          <select
            value={draft.source ?? ''}
            onChange={(e) => setDraft({ ...draft, source: e.target.value || null, confidence: 1 })}
          >
            <option value="">No source (null)</option>
            {dataset.sourceSchema.fields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} · {f.type}
              </option>
            ))}
          </select>
        </label>
        <div className="form-section-head">
          <span className="field-label">Transformation pipeline</span>
          <Button
            variant="ghost"
            disabled={draft.transforms.length >= 6}
            onClick={() =>
              setDraft({ ...draft, transforms: [...draft.transforms, { op: 'trim', arg: null }] })
            }
          >
            <Plus size={14} />
            Add rule
          </Button>
        </div>
        {!draft.transforms.length && (
          <p className="helper">Direct copy. Target types and constraints are still validated.</p>
        )}
        <div className="rule-list">
          {draft.transforms.map((t, i) => (
            <div className="rule-editor" key={i}>
              <div className="rule-controls">
                <span className="rule-number">{i + 1}</span>
                <select
                  aria-label={`Transformation ${i + 1}`}
                  value={t.op}
                  onChange={(e) =>
                    setRule(i, {
                      op: e.target.value as Transform['op'],
                      arg:
                        e.target.value === 'enum_map'
                          ? '{}'
                          : e.target.value === 'default'
                            ? 'null'
                            : e.target.value === 'multiply'
                              ? '1'
                              : null,
                    })
                  }
                >
                  {OPERATIONS.map((op) => (
                    <option key={op} value={op}>
                      {TRANSFORMATIONS.find((t) => t.op === op)?.label}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={`Remove transformation ${i + 1}`}
                  onClick={() =>
                    setDraft({ ...draft, transforms: draft.transforms.filter((_, n) => n !== i) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="helper">
                {TRANSFORMATIONS.find((rule) => rule.op === t.op)?.description}
              </p>
              {['enum_map', 'default', 'multiply'].includes(t.op) && (
                <label className="field-label small">
                  {t.op === 'enum_map'
                    ? 'JSON lookup object'
                    : t.op === 'default'
                      ? 'JSON scalar value'
                      : 'Numeric factor'}
                  <input
                    aria-label={`Argument ${i + 1}`}
                    className="mono"
                    value={t.arg ?? ''}
                    onChange={(e) => setRule(i, { ...t, arg: e.target.value })}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
        <label className="field-label">
          Mapping rationale
          <textarea
            rows={2}
            value={draft.rationale}
            maxLength={800}
            onChange={(e) => setDraft({ ...draft, rationale: e.target.value })}
          />
        </label>
        <div className="info-note">
          <GitBranch size={16} />
          <span>
            Saving creates a new immutable version. Run validation and approve the new version
            before execution.
          </span>
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => onSave({ ...draft, confidence: 1 })}
        >
          <Save size={15} />
          Save new version
        </Button>
      </div>
    </Modal>
  );
}
export function ClarificationEditor({
  plan,
  onSave,
  onClose,
  busy,
}: {
  plan: Plan;
  onSave: (p: Proposal) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(proposalOf(structuredClone(plan)));
  return (
    <Modal title="Resolve clarifications" eyebrow="HUMAN REVIEW" onClose={onClose}>
      <div className="modal-body">
        <p className="modal-intro">
          Record your business decisions. These answers become part of the next plan version and its
          approval fingerprint.
        </p>
        {draft.questions.map((q, i) => (
          <label className="clarification-editor" key={q.id}>
            <span>
              <CircleHelp size={16} />
              <strong>{q.target}</strong>
              <Badge tone={q.blocking ? 'amber' : 'neutral'}>
                {q.blocking ? 'Required' : 'Optional'}
              </Badge>
            </span>
            <p>{q.question}</p>
            <textarea
              aria-label={`Decision for ${q.target}`}
              placeholder="Record your decision and reasoning…"
              rows={2}
              maxLength={1000}
              value={q.resolution ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  questions: draft.questions.map((item, index) =>
                    i === index ? { ...item, resolution: e.target.value || null } : item,
                  ),
                })
              }
            />
          </label>
        ))}
        <div className="info-note">
          <CircleHelp size={16} />
          <span>
            An answer records your decision. If a mapping needs changing, edit its rules before
            approving.
          </span>
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={busy || draft.questions.some((q) => q.blocking && !q.resolution?.trim())}
          onClick={() => onSave(draft)}
        >
          <Save size={15} />
          Save decisions as new version
        </Button>
      </div>
    </Modal>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FileJson,
  FlaskConical,
  GitBranch,
  Github,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Pencil,
  Play,
  RotateCcw,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { LIMITS, type Bundle, type Mapping, type Proposal, type Workspace } from '@/lib/contracts';
import { mappingLabel, proposalOf, validateProposal } from '@/lib/engine';
import { demoPlan, inspectDataset } from '@/lib/planner';
import { PLANNER_REQUEST_TIMEOUT_MS } from '@/lib/planner-limits';
import {
  dispatch,
  loadWorkspace,
  recoverySnapshot,
  resetWorkspace,
  watchWorkspace,
} from '@/lib/store';
import { getDataset, type Command } from '@/lib/lifecycle';
import { ActivityView } from './activity-view';
import { ApprovalDialog, RollbackDialog } from './approval-dialog';
import { ClarificationEditor, MappingEditor } from './mapping-editor';
import { ReconciliationView } from './reconciliation-view';
import { ImportDialog, SourceView } from './source-view';
import { ValidationView } from './validation-view';
import { Badge, Button, download, Empty, ExternalLink, Loading, Logo, Modal, Step } from './ui';

type View = 'mappings' | 'source' | 'validation' | 'reconciliation' | 'activity';
type Dialog =
  'approval' | 'rollback' | 'clarifications' | 'import' | 'settings' | 'guide' | 'reset' | null;
const nav: { view: View; label: string; icon: typeof Database }[] = [
  { view: 'mappings', label: 'Workbench', icon: LayoutDashboard },
  { view: 'source', label: 'Source & target', icon: Database },
  { view: 'validation', label: 'Validation', icon: FlaskConical },
  { view: 'reconciliation', label: 'Reconciliation', icon: Scale },
  { view: 'activity', label: 'Activity', icon: Activity },
];

export function Workbench() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<View>('mappings');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [provider, setProvider] = useState<'demo' | 'live'>('demo');
  const [accessToken, setAccessToken] = useState('');
  const [config, setConfig] = useState({ liveAvailable: false, tokenRequired: false, model: '' });
  const [showTools, setShowTools] = useState(false);
  const refresh = useCallback(() => {
    loadWorkspace()
      .then(setWorkspace)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not open local storage.'));
  }, []);
  useEffect(() => {
    refresh();
    const stop = watchWorkspace(refresh);
    fetch('/api/plan')
      .then((r) => r.json())
      .then((configuration) => {
        setConfig(configuration);
        if (configuration.liveAvailable && !configuration.tokenRequired) setProvider('live');
      })
      .catch(() => {});
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const currentPlans = workspace?.plans.filter((p) => p.datasetId === workspace.dataset.id) ?? [];
  const plan = workspace?.plans.find((p) => p.id === selectedId) ?? currentPlans.at(-1);
  const dataset = workspace && plan ? getDataset(workspace, plan) : workspace?.dataset;
  const run = plan && workspace?.dryRuns[plan.id];
  const approval = plan && workspace?.approvals[plan.id];
  const executions = workspace?.executions.filter((e) => e.planId === plan?.id) ?? [];
  const committed = executions.some((e) => e.status === 'committed');
  const rolledBack = executions.some((e) => e.status === 'rolled_back');
  const blocking = plan?.questions.filter((q) => q.blocking && !q.resolution?.trim()) ?? [];
  const changeView = (v: View) => {
    setView(v);
    setMobileNav(false);
  };
  async function perform(command: Command, success: string): Promise<Workspace | null> {
    setBusy(true);
    setNotice(null);
    try {
      const next = await dispatch(command);
      setWorkspace(next);
      setNotice({ text: success, error: false });
      return next;
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'The operation failed.', error: true });
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function saveProposal(proposal: Proposal) {
    if (!workspace) return;
    const result = await perform(
      {
        type: 'plan',
        proposal,
        provider: 'manual',
        trace: [
          {
            tool: 'validate_proposal',
            status: 'passed',
            detail: 'User-edited proposal checked against fields and supported transformations.',
          },
        ],
        datasetId: workspace.dataset.id,
      },
      'New version saved. Validate and approve it before execution.',
    );
    if (result) {
      setSelectedId(result.plans.at(-1)!.id);
      setEditing(null);
      setDialog(null);
    }
  }
  async function generate() {
    if (!workspace) return;
    setBusy(true);
    setNotice(null);
    try {
      const result =
        provider === 'demo'
          ? demoPlan(workspace.dataset)
          : await (async () => {
              const response = await fetch('/api/plan', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify(inspectDataset(workspace.dataset)),
                signal: AbortSignal.timeout(PLANNER_REQUEST_TIMEOUT_MS),
              });
              const body = await response.json();
              if (!response.ok) throw new Error(body.error || 'Live planning failed.');
              return {
                ...body,
                proposal: validateProposal(body.proposal, workspace.dataset),
                provider: 'live' as const,
              };
            })();
      const next = await dispatch({ type: 'plan', ...result, datasetId: workspace.dataset.id });
      setWorkspace(next);
      setSelectedId(next.plans.at(-1)!.id);
      setView('mappings');
      setNotice({
        text: `${provider === 'live' ? 'AI' : 'Demo'} proposal saved as v${next.plans.at(-1)!.version}. Review the mappings and clarifications.`,
        error: false,
      });
    } catch (e) {
      setNotice({
        text:
          e instanceof Error
            ? e.message
            : 'Planning failed. Select demo mode to try the local planner.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  async function importBundle(bundle: Bundle) {
    const loaded = await perform(
      { type: 'dataset', bundle },
      'Dataset loaded. Preparing a demo proposal…',
    );
    if (!loaded) return;
    const proposed = demoPlan(loaded.dataset);
    const next = await perform(
      { type: 'plan', ...proposed, datasetId: loaded.dataset.id },
      'Dataset imported and inspected. Review the proposed mappings.',
    );
    if (next) {
      setSelectedId(next.plans.at(-1)!.id);
      setView('mappings');
      setDialog(null);
    }
  }
  const dry = async () => {
    if (plan) {
      const next = await perform(
        { type: 'dry_run', planId: plan.id },
        'Deterministic dry run complete. All records accounted for.',
      );
      if (next) setView('validation');
    }
  };
  const execute = async () => {
    if (plan) {
      const next = await perform(
        { type: 'execute', planId: plan.id },
        'Migration attempt recorded. Inspect the receipt and target totals.',
      );
      if (next) {
        const latest = next.executions.at(-1);
        if (latest?.status === 'failed') setNotice({ text: latest.error!, error: true });
        setView('reconciliation');
      }
    }
  };
  if (!workspace)
    return loadError ? (
      <div className="loading">
        <Logo />
        <AlertTriangle size={30} />
        <h2>Local workspace needs attention</h2>
        <p>{loadError}</p>
        <Button onClick={async () => download('relay-recovery.json', await recoverySnapshot())}>
          Export recovery snapshot
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (
              window.confirm(
                'Reset this local workspace? All local plans, target rows and history will be removed.',
              )
            )
              resetWorkspace().then((w) => {
                setWorkspace(w);
                setLoadError('');
              });
          }}
        >
          Reset local demo
        </Button>
      </div>
    ) : (
      <Loading />
    );
  const status = rolledBack
    ? 'Rolled back'
    : committed
      ? 'Committed'
      : approval
        ? 'Approved'
        : run
          ? 'Validated'
          : 'Draft plan';
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to workbench
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Logo />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">R</span>
          <div>
            <strong>Migration workspace</strong>
            <span>Competition edition</span>
          </div>
          <Badge tone="blue">LOCAL</Badge>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.view}
              className={`nav-item ${view === n.view ? 'selected' : ''}`}
              aria-current={view === n.view ? 'page' : undefined}
              onClick={() => changeView(n.view)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.view === 'validation' && run && run.rejected > 0 && (
                <span className="nav-count">{run.rejected}</span>
              )}
              {n.view === 'activity' && (
                <span className="nav-count neutral">{workspace.events.length}</span>
              )}
            </button>
          ))}
        </nav>
        <span className="nav-label resources-label">RESOURCES</span>
        <button className="nav-item" onClick={() => setDialog('guide')}>
          <BookOpen size={18} />
          Submission guide
          <ChevronRight size={14} className="nav-arrow" />
        </button>
        <button className="nav-item" onClick={() => setDialog('settings')}>
          <Settings2 size={18} />
          Workspace settings
        </button>
        <div className="sidebar-bottom">
          <div className="guard-card">
            <span>
              <ShieldCheck size={17} />
              <strong>Guardrails active</strong>
            </span>
            <p>
              Inspect. Propose. Verify.
              <br />
              You stay in control.
            </p>
            <div>
              <i />
              Read-only planning agent
            </div>
          </div>
          <div className="sidebar-user">
            <span className="user-avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <span>Private browser sandbox</span>
            </div>
            <LockKeyhole size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              Workspace
              <ChevronRight size={13} />
              <strong>{workspace.dataset.name}</strong>
            </span>
          </div>
          <div>
            <span className="local-indicator">
              <i />
              Local mock target
            </span>
            <a
              href="https://github.com/tohin003/Async-Task"
              target="_blank"
              rel="noreferrer"
              aria-label="Open GitHub repository"
              className="icon-button"
            >
              <Github size={19} />
            </a>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">PLAN WITH INTELLIGENCE. MOVE WITH CONFIDENCE.</span>
              <h1>
                Migration workbench<span className="heading-dot">.</span>
              </h1>
              <p>A clear path from source data to a verified destination.</p>
            </div>
            <div className="heading-actions">
              <Button
                onClick={() =>
                  download(`relay-workspace-report-v${plan?.version ?? 0}.json`, {
                    exportedAt: new Date().toISOString(),
                    scope: LIMITS,
                    workspace,
                  })
                }
              >
                <ArrowDownToLine size={15} />
                Export report
              </Button>
              {plan && (
                <Button
                  variant="primary"
                  disabled={busy || rolledBack}
                  onClick={approval ? execute : run ? () => setDialog('approval') : dry}
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : approval ? (
                    <Play size={15} />
                  ) : run ? (
                    <ShieldCheck size={15} />
                  ) : (
                    <FlaskConical size={15} />
                  )}
                  {approval
                    ? committed
                      ? 'Retry migration'
                      : 'Execute migration'
                    : run
                      ? 'Review & approve'
                      : 'Run dry run'}
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </div>
          {notice && (
            <div
              className={`toast ${notice.error ? 'error' : 'success'}`}
              role={notice.error ? 'alert' : 'status'}
            >
              {notice.error ? <AlertTriangle size={17} /> : <Check size={17} />}
              <span>{notice.text}</span>
              <button
                aria-label="Dismiss message"
                className="icon-button"
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {plan && dataset ? (
            <>
              <div className="migration-meta">
                <div>
                  <span className="project-dot" />
                  {dataset.name}
                  <Badge tone={approval || committed ? 'green' : 'blue'}>{status}</Badge>
                </div>
                <div>
                  <GitBranch size={14} />
                  <select
                    aria-label="Plan version"
                    value={plan.id}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    {workspace.plans.toReversed().map((p) => (
                      <option key={p.id} value={p.id}>
                        Plan v{p.version}
                        {p.datasetId !== workspace.dataset.id ? ' · archived dataset' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="meta-divider" />
                  <span className="muted">
                    {plan.provider === 'demo'
                      ? 'Demo proposal'
                      : plan.provider === 'live'
                        ? 'AI proposal'
                        : 'User-reviewed plan'}
                  </span>
                </div>
              </div>
              <div className="workflow-steps">
                <Step
                  number={1}
                  label="Inspect source"
                  done
                  active={view === 'source'}
                  onClick={() => setView('source')}
                />
                <div className="step-line" />
                <Step
                  number={2}
                  label="Map fields"
                  done={Boolean(run)}
                  active={view === 'mappings'}
                  onClick={() => setView('mappings')}
                />
                <div className="step-line" />
                <Step
                  number={3}
                  label="Validate"
                  done={Boolean(run)}
                  active={view === 'validation'}
                  onClick={() => setView('validation')}
                />
                <div className="step-line" />
                <Step
                  number={4}
                  label="Approve"
                  done={Boolean(approval)}
                  active={dialog === 'approval'}
                  onClick={() => (run ? setDialog('approval') : setView('validation'))}
                />
                <div className="step-line" />
                <Step
                  number={5}
                  label="Execute & reconcile"
                  done={committed}
                  active={view === 'reconciliation'}
                  onClick={() => setView('reconciliation')}
                />
              </div>
              <div className="metric-grid">
                <div className="metric-card">
                  <span>
                    Source records
                    <Database size={15} />
                  </span>
                  <strong>
                    {dataset.records.length}
                    <small>records</small>
                  </strong>
                  <p>
                    <span className="metric-dot blue" />
                    Bounded sample · max {LIMITS.records}
                  </p>
                </div>
                <div className="metric-card">
                  <span>
                    Mapped fields
                    <GitBranch size={15} />
                  </span>
                  <strong>
                    {
                      plan.mappings.filter(
                        (m) => m.source || m.transforms.some((t) => t.op === 'default'),
                      ).length
                    }
                    <small>/ {dataset.targetSchema.fields.length} fields</small>
                  </strong>
                  <p>
                    <span className="metric-dot blue" />
                    {plan.mappings.length} explicit target mappings
                  </p>
                </div>
                <div className="metric-card">
                  <span>
                    Validation health
                    <ListChecks size={15} />
                  </span>
                  <strong>
                    {run ? Math.round((run.accepted / run.source) * 100) : '—'}
                    <small>{run ? '% accepted' : 'Awaiting dry run'}</small>
                  </strong>
                  <p>
                    <span className={`metric-dot ${run ? 'amber' : 'neutral'}`} />
                    {run ? `${run.rejected} records quarantined` : 'No target changes yet'}
                  </p>
                </div>
                <div className="metric-card">
                  <span>
                    Target records
                    <ShieldCheck size={15} />
                  </span>
                  <strong>
                    {workspace.target.filter((t) => t.planId === plan.id).length}
                    <small>persisted</small>
                  </strong>
                  <p>
                    <span className={`metric-dot ${committed ? 'green' : 'neutral'}`} />
                    {rolledBack
                      ? 'Scoped rollback complete'
                      : committed
                        ? 'Atomic mock migration'
                        : 'Explicit approval required'}
                  </p>
                </div>
              </div>
              <div className={`workbench-grid ${view !== 'mappings' ? 'full-width' : ''}`}>
                <section className="workspace-content" aria-label={view}>
                  <div className="content-tabs">
                    {(
                      [
                        { v: 'mappings', label: 'Field mappings', icon: GitBranch },
                        { v: 'validation', label: 'Validation', icon: FlaskConical },
                        { v: 'reconciliation', label: 'Reconciliation', icon: Scale },
                        { v: 'activity', label: 'Activity', icon: Activity },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.v}
                        className={view === t.v ? 'active' : ''}
                        onClick={() => setView(t.v)}
                      >
                        <t.icon size={15} />
                        {t.label}
                        {t.v === 'mappings' && <span>{plan.mappings.length}</span>}
                      </button>
                    ))}
                  </div>
                  {view === 'mappings' && (
                    <>
                      <div className="schema-route">
                        <div>
                          <span className="schema-icon source">
                            <Database size={18} />
                          </span>
                          <div>
                            <span className="eyebrow">SOURCE</span>
                            <strong>{dataset.sourceSchema.name}</strong>
                            <small>
                              JSON dataset · {dataset.sourceSchema.fields.length} fields
                            </small>
                          </div>
                        </div>
                        <span className="route-arrow">
                          <ArrowRight size={19} />
                        </span>
                        <div>
                          <span className="schema-icon target">
                            <Database size={18} />
                          </span>
                          <div>
                            <span className="eyebrow">TARGET</span>
                            <strong>{dataset.targetSchema.name}</strong>
                            <small>
                              Mock staging store · {dataset.targetSchema.fields.length} fields
                            </small>
                          </div>
                        </div>
                      </div>
                      <div className="panel mappings-panel">
                        <div className="panel-head">
                          <div>
                            <h3>
                              Field mapping plan <Badge tone="blue">v{plan.version}</Badge>
                            </h3>
                            <p>Review every destination field and its transformation rules.</p>
                          </div>
                          <Button variant="ghost" onClick={() => setView('source')}>
                            <FileJson size={14} />
                            View schemas
                          </Button>
                        </div>
                        <div className="table-scroll">
                          <table className="data-table mapping-table">
                            <thead>
                              <tr>
                                <th>Source field</th>
                                <th />
                                <th>Target field</th>
                                <th>Transformation</th>
                                <th>Confidence</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {plan.mappings.map((m) => (
                                <tr key={m.target}>
                                  <td>
                                    <div className="field-cell">
                                      <code>{m.source ?? 'No source'}</code>
                                      <span>
                                        {dataset.sourceSchema.fields.find(
                                          (f) => f.name === m.source,
                                        )?.type ?? 'null'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="mapping-arrow">
                                    <ArrowRight size={14} />
                                  </td>
                                  <td>
                                    <div className="field-cell">
                                      <code>{m.target}</code>
                                      <span>
                                        {
                                          dataset.targetSchema.fields.find(
                                            (f) => f.name === m.target,
                                          )?.type
                                        }
                                        {dataset.targetSchema.fields.find(
                                          (f) => f.name === m.target,
                                        )?.required && <i title="Required field">*</i>}
                                      </span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="transformation-chip" title={m.rationale}>
                                      {mappingLabel(m)}
                                    </span>
                                  </td>
                                  <td>
                                    <div
                                      className={`confidence ${m.confidence < 0.95 ? 'medium' : ''}`}
                                      title="Heuristic confidence, not a measured probability"
                                    >
                                      <span>
                                        <i style={{ width: `${m.confidence * 100}%` }} />
                                      </span>
                                      <small>{Math.round(m.confidence * 100)}%</small>
                                    </div>
                                  </td>
                                  <td>
                                    <button
                                      className="icon-button"
                                      aria-label={`Edit mapping for ${m.target}`}
                                      disabled={busy || plan.datasetId !== workspace.dataset.id}
                                      onClick={() => setEditing(m)}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="panel-bottom">
                          <span>
                            <ShieldCheck size={14} />
                            All mappings checked against the provided schemas
                          </span>
                          <span className="muted">
                            {plan.mappings.reduce((n, m) => n + m.transforms.length, 0)}{' '}
                            transformation steps
                          </span>
                        </div>
                      </div>
                      <div className="review-callout">
                        <div className="review-callout-icon">
                          <LockKeyhole size={20} />
                        </div>
                        <div>
                          <h3>Your approval is the checkpoint.</h3>
                          <p>
                            {blocking.length
                              ? `Resolve ${blocking.length} required clarifications, then validate and approve the exact plan.`
                              : 'Run a dry run, inspect the evidence, and explicitly approve before migration.'}
                          </p>
                        </div>
                        <Button
                          onClick={blocking.length ? () => setDialog('clarifications') : dry}
                          disabled={busy}
                        >
                          {blocking.length ? 'Resolve questions' : 'Validate plan'}
                          <ArrowRight size={14} />
                        </Button>
                      </div>
                    </>
                  )}
                  {view === 'source' && (
                    <SourceView dataset={dataset} onImport={() => setDialog('import')} />
                  )}
                  {view === 'validation' && (
                    <ValidationView
                      key={plan.id}
                      run={run}
                      plan={plan}
                      dataset={dataset}
                      busy={busy}
                      onRun={dry}
                    />
                  )}
                  {view === 'reconciliation' && (
                    <ReconciliationView
                      key={plan.id}
                      workspace={workspace}
                      plan={plan}
                      busy={busy}
                      onExecute={execute}
                      onRollback={() => setDialog('rollback')}
                      onReconcile={() =>
                        perform(
                          { type: 'reconcile', planId: plan.id },
                          'Source counts and target content reconciled.',
                        )
                      }
                    />
                  )}
                  {view === 'activity' && <ActivityView workspace={workspace} />}
                </section>
                {view === 'mappings' && (
                  <aside className="assistant-rail" aria-label="Planning assistant">
                    <div className="panel assistant-panel">
                      <div className="assistant-heading">
                        <div className="sparkle-icon">
                          <Sparkles size={19} />
                        </div>
                        <div>
                          <h3>Planning assistant</h3>
                          <span>Intelligence, with boundaries.</span>
                        </div>
                        <span className="assistant-live-dot" />
                      </div>
                      <div className="assistant-body">
                        <div className="assistant-mode">
                          <Badge tone="blue">
                            {provider === 'demo' ? 'Deterministic demo' : 'Live AI planner'}
                          </Badge>
                          <button
                            onClick={() => setDialog('settings')}
                            aria-label="Configure planning provider"
                          >
                            <Settings2 size={15} />
                          </button>
                        </div>
                        <p>{plan.summary}</p>
                        <Button
                          variant="primary"
                          className="generate-button"
                          disabled={busy || (provider === 'live' && !config.liveAvailable)}
                          onClick={generate}
                        >
                          {busy ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Sparkles size={15} />
                          )}
                          Generate new proposal
                        </Button>
                        <div className="agent-boundary">
                          <LockKeyhole size={12} />
                          Can inspect and propose. Cannot execute.
                        </div>
                        <button
                          className="tool-toggle"
                          onClick={() => setShowTools(!showTools)}
                          aria-expanded={showTools}
                        >
                          <ShieldCheck size={15} />
                          <span>
                            {plan.trace.filter((t) => t.status === 'passed').length} tool checks
                            passed
                          </span>
                          <ChevronDown size={14} className={showTools ? 'rotated' : ''} />
                        </button>
                        {showTools && (
                          <div className="tool-trace">
                            {plan.trace.map((t, i) => (
                              <div key={i}>
                                <Check size={13} />
                                <span>
                                  <code>{t.tool}</code>
                                  <small>{t.detail}</small>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="panel risks-panel">
                      <div className="rail-panel-head">
                        <h3>
                          <AlertTriangle size={16} />
                          Mapping risks
                        </h3>
                        <span className="count-badge">{plan.risks.length}</span>
                      </div>
                      {plan.risks.length ? (
                        plan.risks.map((r, i) => (
                          <div className="risk-item" key={i}>
                            <div>
                              <code>{r.field}</code>
                              <Badge tone={r.severity === 'high' ? 'amber' : 'neutral'}>
                                {r.severity}
                              </Badge>
                            </div>
                            <p>{r.message}</p>
                            <small>{r.evidence}</small>
                          </div>
                        ))
                      ) : (
                        <p className="rail-empty">
                          No additional mapping risks identified. Review the dry-run evidence.
                        </p>
                      )}
                    </div>
                    <div className="panel questions-panel">
                      <div className="rail-panel-head">
                        <h3>
                          <CircleHelp size={16} />
                          Clarifications
                        </h3>
                        <span className="count-badge">{blocking.length}</span>
                      </div>
                      {plan.questions.map((q) => (
                        <div className="question-item" key={q.id}>
                          <span className={q.resolution ? 'question-resolved' : ''}>
                            {q.resolution ? <Check size={13} /> : <CircleHelp size={13} />}
                            {q.resolution
                              ? 'Resolved'
                              : q.blocking
                                ? 'Decision needed'
                                : 'Optional question'}
                          </span>
                          <p>{q.question}</p>
                          {q.resolution && <small>{q.resolution}</small>}
                        </div>
                      ))}
                      {plan.questions.length > 0 ? (
                        <Button
                          className="questions-button"
                          onClick={() => setDialog('clarifications')}
                        >
                          Review clarifications
                          <ArrowRight size={14} />
                        </Button>
                      ) : (
                        <p className="rail-empty">No outstanding clarification questions.</p>
                      )}
                    </div>
                  </aside>
                )}
              </div>
            </>
          ) : (
            <Empty
              icon={<GitBranch size={30} />}
              title="A fresh starting point"
              action={
                <Button variant="primary" onClick={generate} disabled={busy}>
                  <Sparkles size={15} />
                  Propose field mappings
                </Button>
              }
            >
              Your dataset is loaded. Let the bounded planner inspect the schemas and prepare a
              mapping proposal.
            </Empty>
          )}
          <footer className="page-footer">
            <span>
              <Logo compact />
              Careful by design.
            </span>
            <span>
              One dataset. Full accountability.<span className="footer-dot">·</span>
              <button onClick={() => setDialog('import')}>
                <Upload size={12} />
                Import dataset
              </button>
            </span>
          </footer>
        </main>
      </div>
      {editing && dataset && plan && (
        <MappingEditor
          mapping={editing}
          dataset={dataset}
          onClose={() => setEditing(null)}
          busy={busy}
          onSave={(mapping) =>
            saveProposal({
              ...proposalOf(plan),
              mappings: plan.mappings.map((m) => (m.target === mapping.target ? mapping : m)),
            })
          }
        />
      )}
      {dialog === 'clarifications' && plan && (
        <ClarificationEditor
          key={plan.id}
          plan={plan}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={saveProposal}
        />
      )}
      {dialog === 'approval' && plan && run && (
        <ApprovalDialog
          plan={plan}
          run={run}
          busy={busy}
          onClose={() => setDialog(null)}
          onApprove={async (reviewer, note) => {
            const next = await perform(
              { type: 'approve', planId: plan.id, reviewer, note, expectedDigest: run.digest },
              `Plan v${plan.version} approved. You can now execute the migration.`,
            );
            if (next) {
              setDialog(null);
              setView('reconciliation');
            }
          }}
        />
      )}
      {dialog === 'rollback' && plan && (
        <RollbackDialog
          plan={plan}
          workspace={workspace}
          busy={busy}
          onClose={() => setDialog(null)}
          onRollback={async (reviewer, reason) => {
            const next = await perform(
              { type: 'rollback', planId: plan.id, reviewer, reason },
              'Owned target rows removed. Full history preserved.',
            );
            if (next) setDialog(null);
          }}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog
          onClose={() => setDialog(null)}
          onImport={importBundle}
          busy={busy}
          hasTarget={Boolean(workspace.target.length)}
        />
      )}
      {dialog === 'settings' && (
        <Modal
          title="Workspace settings"
          eyebrow="PLANNER & PERSISTENCE"
          onClose={() => setDialog(null)}
        >
          <div className="modal-body">
            <label className="field-label">
              Planning provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'demo' | 'live')}
              >
                <option value="demo">Deterministic demo — no API key required</option>
                <option value="live" disabled={!config.liveAvailable}>
                  Live OpenAI agent{' '}
                  {config.liveAvailable ? `· ${config.model}` : '· not configured'}
                </option>
              </select>
            </label>
            <p className="helper">
              The demo planner uses a finite matching registry and is labeled throughout. Live mode
              performs a bounded tool-calling loop with a server-side API key.
            </p>
            {!config.liveAvailable && (
              <div className="info-note">
                <Settings2 size={16} />
                <span>
                  To enable live AI, set OPENAI_API_KEY and optional OPENAI_MODEL in Vercel, then
                  redeploy. Add PLANNER_ACCESS_TOKEN to restrict paid requests.
                </span>
              </div>
            )}
            {config.tokenRequired && (
              <label className="field-label">
                Live planner access token
                <input
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Token provided by the deployment owner"
                />
                <span className="helper">Kept in memory only. Never exported or persisted.</span>
              </label>
            )}
            <div className="info-note">
              <LockKeyhole size={16} />
              <span>
                Raw records stay in IndexedDB. Live planning sends schemas and aggregate profiles to
                OpenAI when you request a proposal.
              </span>
            </div>
            <h4>Local workspace</h4>
            <p className="helper">
              This browser has one isolated mock target. Reload preserves plans, approvals and
              history. Clearing site data removes them.
            </p>
            <Button variant="danger" onClick={() => setDialog('reset')}>
              <RotateCcw size={15} />
              Reset local demo
            </Button>
          </div>
          <div className="modal-footer">
            <Button variant="primary" onClick={() => setDialog(null)}>
              Save preferences
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'reset' && (
        <Modal
          title="Reset the local workspace?"
          eyebrow="CLEAR LOCAL DATA"
          onClose={() => setDialog(null)}
        >
          <div className="modal-body">
            <p>
              This removes all local plans, approvals, target rows and history, then loads a fresh
              demo. Export your report first if you need to retain evidence.
            </p>
            <Button onClick={() => download('relay-workspace-backup.json', workspace)}>
              <ArrowDownToLine size={15} />
              Export backup
            </Button>
          </div>
          <div className="modal-footer">
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const w = await resetWorkspace();
                  setWorkspace(w);
                  setSelectedId('');
                  setView('mappings');
                  setDialog(null);
                  setNotice({ text: 'Fresh demo loaded.', error: false });
                } catch (e) {
                  setNotice({
                    text: e instanceof Error ? e.message : 'Reset failed.',
                    error: true,
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reset workspace
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'guide' && (
        <Modal
          title="A five-minute competition walkthrough"
          eyebrow="RELAY · SUBMISSION GUIDE"
          onClose={() => setDialog(null)}
        >
          <div className="modal-body">
            <div className="guide-intro">
              <Sparkles size={22} />
              <p>Plan with an agent. Validate with evidence. Execute with your approval.</p>
            </div>
            <ol className="guide-steps">
              <li>
                <strong>Inspect & map</strong>
                <p>
                  Review 8 source and target fields, supported transformations, risk evidence and
                  the tool trace.
                </p>
              </li>
              <li>
                <strong>Resolve two business decisions</strong>
                <p>
                  Confirm the zero default and status semantics. Your answers create a new plan
                  version.
                </p>
              </li>
              <li>
                <strong>Run deterministic validation</strong>
                <p>
                  120 records become 108 accepted and 12 quarantined. Open a rejected row to inspect
                  exact field evidence.
                </p>
              </li>
              <li>
                <strong>Approve, execute, retry</strong>
                <p>
                  Approve the exact version, execute 108 inserts, then retry: zero inserts and 108
                  skips.
                </p>
              </li>
              <li>
                <strong>Reconcile & roll back</strong>
                <p>
                  Verify counts and content hashes, roll back owned rows, and inspect the preserved
                  activity trail.
                </p>
              </li>
            </ol>
            <div className="info-note">
              <ShieldCheck size={16} />
              <span>
                The planner can never execute or approve. The migration engine permits only finite
                rules and approved fingerprints.
              </span>
            </div>
            <div className="guide-links">
              <ExternalLink href="https://github.com/tohin003/Async-Task">
                Source & deployment guide
              </ExternalLink>
              <Badge>500-record maximum</Badge>
            </div>
          </div>
          <div className="modal-footer">
            <Button variant="primary" onClick={() => setDialog(null)}>
              Start exploring
              <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

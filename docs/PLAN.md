# Relay — phased delivery plan

## Scope and product

Build the detailed **Agentic Data Migration Planner and Reconciliation Workbench** assignment. The unrelated Equipment Maintenance heading is not part of this implementation. Relay migrates one flat JSON source into one typed mock target, with at most **500 records, 32 fields, 1 MB per input file**. It runs on Next.js and Vercel. The mock database is an IndexedDB workspace isolated to the current browser/origin; no server filesystem or production database is assumed.

## Phase 1 — foundation

- Next.js, strict TypeScript, lint/test/build scripts, Vercel configuration.
- Define architecture, invariants, scope limits, acceptance criteria and demo journey.
- Inspect AgentGuard; document its supported integration honestly.
- Gate: reproducible dependency installation, documented architecture.

## Phase 2 — deterministic migration domain

- Runtime schemas, finite transformation registry, strict value validation.
- Canonical SHA-256 fingerprints bind dataset/schema/mappings to dry runs and approvals.
- Immutable plan versions; edits invalidate dry-run and approval.
- Record quarantine with original value, transformed value, field, rule and error code.
- Transactional IndexedDB commands; retry deduplication; owned-row rollback; event history.
- Reconcile counts and content against the target, including deleted/drifted rows.
- Gate: domain and persistence tests covering failure modes and invariants.

## Phase 3 — bounded planning agent

- Read-only tools: inspect schemas, profile fields, inspect supported transformations, validate proposal.
- Server-only optional live OpenAI tool loop; capped rounds/calls/time/input/output.
- No execute, approve, rollback, arbitrary code, network inspection or database tools.
- Validate every proposal against actual fields and transformation allowlist; preserve tool evidence.
- Explicit deterministic demo provider; provider failures never masquerade as successful AI output.
- Clarifications and risk explanations retained with the proposal; user decisions form a new version.
- Gate: fabricated-field, unsupported-rule and tool-boundary tests.

## Phase 4 — workbench experience

- Distinctive responsive interface: source/target overview, mapping editor, agent panel.
- Dry-run count waterfall, searchable records, side-by-side field evidence, quarantine export.
- Explicit approval dialog with reviewer, exact version, accepted/rejected counts and fingerprint.
- Execute/retry, reconciliation, target inspector, scoped rollback dialog and audit timeline.
- JSON import, example download, report export, persistent reload, recovery messages.
- Gate: keyboard/mobile/desktop review and complete browser workflow.

## Phase 5 — submission and release

- Adversarial unit/integration tests and browser acceptance tests.
- CI, README, deployment instructions, architecture, limits and competition demo script.
- Production build, dependency audit, optional AgentGuard repository inspection.
- Push meaningful commits after each phase; verify GitHub HEAD.
- Gate: all checks pass; clean repository; deployable on Vercel.

## Non-negotiable invariants

1. AI can propose; only a user can approve. No draft can execute.
2. An approval binds an immutable plan fingerprint and exact deterministic dry-run result.
3. Accepted + quarantined = source. Every row is accounted for.
4. An identical retry inserts zero duplicate rows. Conflicting target keys never overwrite.
5. Target writes and audit history commit atomically; concurrent tabs serialize through IndexedDB.
6. Rollback removes only rows owned by the selected execution and retains all history.
7. Unsupported transformations and fabricated fields fail closed in the migration runtime.
8. Mock persistence is local, inspectable and clearly labeled; no production claims.

## Commit sequence

1. `chore: establish Relay architecture and Vercel-ready foundation`
2. `feat: implement deterministic migration lifecycle and transactional mock store`
3. `feat: add bounded planning agent and evidence-backed proposal validation`
4. `feat: build complete migration and reconciliation workbench`
5. `test: harden workflows and prepare competition submission`

Phase completion and verification evidence are recorded in RELEASE.md.

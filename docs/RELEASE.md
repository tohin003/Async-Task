# Release verification

Verified locally on October 6, 2026 with Node.js 24.14.1, Next.js 16.3.8 and Chromium. This record describes checks actually run, not a promise of production database suitability.

## Phased delivery

| Phase                        | Result                                                                                                    | Commit    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1 — foundation               | Architecture, invariants, bounded scope and deployment foundation                                         | `bc029a9` |
| 2 — deterministic domain     | Transformations, validation, versioning, approval and atomic mock lifecycle                               | `c451da3` |
| 3 — planning agent           | Read-only tools, live provider loop, proposal guards and demo provider                                    | `9fd6144` |
| 4 — workbench                | Mapping review, import, validation, approval, target, reconciliation and history                          | `55c34ad` |
| 5 — hardening and submission | Adversarial tests, browser verification, accessibility, CI, screenshots and release docs                  | `3b6d96d` |
| 6 — live deployment          | Evidence-grounded live planning, public-origin handling and Vercel deployment                             | `d6db93d` |
| 7 — production reliability   | Strict output schema, bounded repair, typed categorical guards, whitespace evidence and aligned deadlines | `9df888b` |

## Executed checks

- Strict TypeScript: passed.
- ESLint, React hooks and JSX accessibility rules: passed with no warnings.
- **60 unit/integration tests across 7 files: passed.** Covers deterministic transforms, all-row accounting, schema/rule guardrails, bounded inputs, exact approval binding, missing reviewer/validation, zero accepted rows, target conflicts, content drift, rollback, persistence, simultaneous retries, typed categorical and whitespace evidence, required business decisions, public/proxy origin validation, agent tool boundaries, strict final-output schema, bounded repair, cancellation, structured log correlation, sensitive-field exclusion and provider/input failure classification.
- **8 Chromium browser tests against the production build: passed.** Covers the complete lifecycle, rejected-row evidence, retry counts, reload persistence, immutable edits, blocked approval/execution, custom import, 390px mobile navigation/overflow, short desktop/mobile sidebar visibility and serious/critical accessibility checks across the workbench, source inspection, validation, field-evidence and approval dialogs, reconciliation and history.
- Production Next.js build: passed. Homepage and icon prerender; planning route remains dynamic.
- `npm audit`: **0 vulnerabilities** in the installed dependency tree. Vulnerable development lint/test dependencies discovered during implementation were replaced or upgraded.
- Real screenshots captured from the production application after scripted review, execution, retry, reconciliation and rollback.
- Actual AgentGuard repository index invoked through the optional isolated development adapter: passed. [Captured evidence](agentguard-inspection.json). Its TypeScript symbol extractor was unavailable, so no TypeScript symbol-verification claim is made.
- Credential audit: supplied OpenAI/Vercel credentials were absent from the full Git patch history (1.1 MB scanned) and the inspected repository/client assets. Private configuration remains ignored.

## Submission audit and viewport correction

The [requirements audit](SUBMISSION_CHECKLIST.md) maps the supplied screenshot to implementation and evidence. The required root [AGENT_USAGE.md](../AGENT_USAGE.md), [structured-log documentation](LOGGING.md), public [synthetic sample input](../public/examples/customer-migration.json) and [paste-ready reviewer remarks](SUBMISSION_REMARKS.md) are present.

The reported sidebar footer clipping was reproduced on the previous public deployment: at a 520px viewport height the footer ended below 845px. The corrected production build keeps the footer fully inside the viewport and scrolls navigation/resources independently. Regression checks pass at 1440×520, 1024×420 and 390×560. [Actual short-viewport screenshot](screenshots/sidebar-short-viewport.png).

## Reproduced counts

| Operation                | Source | Accepted | Quarantined | Target | New inserts | Skips |
| ------------------------ | -----: | -------: | ----------: | -----: | ----------: | ----: |
| Dry run                  |    120 |      108 |          12 |      0 |           0 |     0 |
| First approved execution |    120 |      108 |          12 |    108 |         108 |     0 |
| Identical retry          |    120 |      108 |          12 |    108 |           0 |   108 |
| Scoped rollback          |    120 |      108 |          12 |      0 |           — |     — |

Quarantine includes invalid email, impossible date, decimal parsing failure, duplicate ID, missing ID and unrecognized boolean evidence. Source records remain unchanged.

## Deployment and provider status

Relay is published at [relay-migration-workbench.vercel.app](https://relay-migration-workbench.vercel.app). Its Vercel project is connected to GitHub; production and preview provider variables are configured with the API key marked sensitive. Credentials remain excluded from Git and deployment uploads.

The live provider tool loop and HTTP boundary were exercised with controlled provider fixtures and real `gpt-4.1-mini` requests. The final public production test on October 6, 2026 generated a valid proposal in **14.3 seconds**, including a guarded repair. Its isolated synthetic workspace verified **120 source, 100 accepted, 20 quarantined, 100 first inserts, zero retry inserts, 100 retry skips, reload persistence and zero target rows after rollback**. [Sanitized production verification report](live-verification.json). All seven browser acceptance tests also passed against the hosted application, and [GitHub CI passed for the production code commit](https://github.com/tohin003/Async-Task/actions/runs/37455397664).

Live plans can quarantine additional missing values rather than infer defaults; the exact counts depend on the reviewed plan. Scripted test approvals apply only to that synthetic test workspace, not user datasets. Provider availability and latency can change; errors preserve the existing plan and never bypass approval or silently switch providers.

## Practical limits

The mock target and reviewer attestations are browser-local, not enterprise authentication or a multi-user datastore. Hash chaining is inspectable accidental-corruption evidence, not tamper-proof storage. A dataset is at most 500 rows, 32 fields per schema and 1 MB; a workspace holds at most 50 plan versions. Production connectors, arbitrary code, distributed execution and exact decimal accounting are outside scope.

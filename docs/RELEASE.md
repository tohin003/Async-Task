# Release verification

Verified locally on October 6, 2026 with Node.js 24.14.1, Next.js 16.3.8 and Chromium. This record describes checks actually run, not a promise of production database suitability.

## Phased delivery

| Phase                        | Result                                                                                   | Commit                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1 — foundation               | Architecture, invariants, bounded scope and deployment foundation                        | `bc029a9`                                  |
| 2 — deterministic domain     | Transformations, validation, versioning, approval and atomic mock lifecycle              | `c451da3`                                  |
| 3 — planning agent           | Read-only tools, live provider loop, proposal guards and demo provider                   | `9fd6144`                                  |
| 4 — workbench                | Mapping review, import, validation, approval, target, reconciliation and history         | `55c34ad`                                  |
| 5 — hardening and submission | Adversarial tests, browser verification, accessibility, CI, screenshots and release docs | See final submission commit in Git history |

## Executed checks

- Strict TypeScript: passed.
- ESLint, React hooks and JSX accessibility rules: passed with no warnings.
- **44 unit/integration tests across 5 files: passed.** Covers deterministic transforms, all-row accounting, schema/rule guardrails, bounded inputs, exact approval binding, missing reviewer/validation, zero accepted rows, target conflicts, content drift, rollback, persistence, simultaneous retries, agent tool boundaries and live API request boundaries.
- **7 Chromium browser tests against the production build: passed.** Covers the complete lifecycle, rejected-row evidence, retry counts, reload persistence, immutable edits, blocked approval/execution, custom import, 390px mobile navigation/overflow and serious/critical accessibility checks across the workbench, source inspection, validation, field-evidence and approval dialogs, reconciliation and history.
- Production Next.js build: passed. Homepage and icon prerender; planning route remains dynamic.
- `npm audit`: **0 vulnerabilities** in the installed dependency tree. Vulnerable development lint/test dependencies discovered during implementation were replaced or upgraded.
- Real screenshots captured from the production application after scripted review, execution, retry, reconciliation and rollback.
- Actual AgentGuard repository index invoked through the optional isolated development adapter: passed. [Captured evidence](agentguard-inspection.json). Its TypeScript symbol extractor was unavailable, so no TypeScript symbol-verification claim is made.

## Reproduced counts

| Operation                | Source | Accepted | Quarantined | Target | New inserts | Skips |
| ------------------------ | -----: | -------: | ----------: | -----: | ----------: | ----: |
| Dry run                  |    120 |      108 |          12 |      0 |           0 |     0 |
| First approved execution |    120 |      108 |          12 |    108 |         108 |     0 |
| Identical retry          |    120 |      108 |          12 |    108 |           0 |   108 |
| Scoped rollback          |    120 |      108 |          12 |      0 |           — |     — |

Quarantine includes invalid email, impossible date, decimal parsing failure, duplicate ID, missing ID and unrecognized boolean evidence. Source records remain unchanged.

## Deployment and provider status

The repository is Vercel-ready. No deployment is claimed: the available environment token and saved Vercel login were both rejected as invalid. Renew the Vercel login or import the repository through the dashboard using [DEPLOYMENT.md](DEPLOYMENT.md).

The live provider tool loop and HTTP boundary were exercised with controlled provider fixtures. An actual paid OpenAI request is not claimed; enabling it requires the owner's server-side API key. Demo mode is complete and clearly labeled.

## Practical limits

The mock target and reviewer attestations are browser-local, not enterprise authentication or a multi-user datastore. Hash chaining is inspectable accidental-corruption evidence, not tamper-proof storage. A dataset is at most 500 rows, 32 fields per schema and 1 MB; a workspace holds at most 50 plan versions. Production connectors, arbitrary code, distributed execution and exact decimal accounting are outside scope.

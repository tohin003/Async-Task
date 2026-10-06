# Architecture and trust boundaries

Relay is a bounded migration workbench, not a production ETL platform.

```
JSON bundle → runtime validation → immutable dataset
                                  ↓
read-only inspection tools → planner → validated proposal → user-edited plan version
                                                           ↓
finite transformations → deterministic dry run → explicit approval → atomic mock write
                                      ↓                               ↓
                               field-level quarantine         reconcile / retry / rollback
                                                                      ↓
                                                     append-only local event history
```

## Separation of responsibilities

- `src/lib/contracts.ts`: bounded, runtime-validated data contracts.
- `src/lib/engine.ts`: pure deterministic transformations, validation and quarantine.
- `src/lib/lifecycle.ts`: approval, execution, retry, reconciliation and rollback policies.
- `src/lib/store.ts`: one atomic IndexedDB read-modify-write transaction per command; refresh across tabs.
- `src/lib/planner.ts`: tool allowlist, aggregate-only inspection, proposal guard.
- `src/app/api/plan/route.ts`: optional server-side live planning; secrets never reach the browser.
- `src/components/`: product experience, user intent and evidence inspection.

## Storage model

One workspace has one dataset, an immutable version list, dry runs and approvals keyed by plan version, execution attempts, target rows with ownership provenance, and an event list. IndexedDB persists the complete snapshot atomically. A dataset replacement is allowed only after all live executions have been rolled back. Existing plans and history are retained. Target identity is the target schema's designated required primary key. Retrying the same migration distinguishes a matching owned row (skip) from a conflicting row (abort transaction). Approved plans cannot be edited; edits create new versions. An approval is an explicit reviewer attestation within the local mock, not enterprise authentication.

## Fingerprints and determinism

Canonical JSON sorts object keys, preserves arrays, and feeds SHA-256. Dataset fingerprints include both schemas and sample rows. Plan fingerprints include dataset identity, mappings and clarification resolutions. Dry-run digests include each original/transformed record and field evidence. Execution recomputes the dry run and requires an exact approval/digest match. Hashes detect accidental drift; a local user can alter browser storage, so this is not tamper-proof forensic storage.

## AI trust boundary

The planner receives schemas and aggregate validation profiles only. It can inspect supported transformations and validate a proposed mapping. It cannot approve or mutate the target. All output passes bounded Zod contracts and semantic validation. Source text is data, never instructions. Live calls have fixed provider endpoint, bounded rounds, abort timeout and strict tool arguments. Demo planning is explicitly deterministic and makes no LLM claim. A failed live call surfaces an error and requires the user to choose demo planning.

## AgentGuard

The supplied AgentGuard is a Python coding-agent guard with a supported Claude Code integration. It has no LLM, prebuilt Codex adapter or Vercel/browser runtime. Relay uses original TypeScript domain guards inspired by its evidence-first principles, not a port or bundled AgentGuard daemon. An optional development script invokes AgentGuard's actual repository index through a user-provided installation. It reports supported/unknown evidence and never claims an automatic live-hook integration.

## Deployment

Next.js App Router on Vercel. IndexedDB avoids unreliable serverless local-disk persistence. Each visitor owns an isolated mock target. No credentials are needed for demo mode. Live mode uses environment secrets and an optional access token. Raw records stay in the browser; schema/profiles are sent only when the user selects live planning. No arbitrary transformation code, external database connections, or distributed execution.

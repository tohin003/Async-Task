# Competition submission — Relay

[Open the live application](https://relay-migration-workbench.vercel.app). The seeded initial proposal is explicitly labeled as a demo. Select **Generate new proposal** to run the real OpenAI agent and inspect its tool evidence. The timed walkthrough below follows the deterministic seeded plan; live proposals can ask different clarification questions and produce different quarantine counts.

## Problem addressed

A migration proposal is not enough. Operators need to know which records will move, why others fail, who approved the exact rules, whether a retry will duplicate rows, and whether a rollback preserves accountability.

Relay implements the detailed **Agentic Data Migration Planner and Reconciliation Workbench** assignment. The separate equipment-maintenance heading in the supplied task text is not implemented.

## Five-minute presentation

| Time      | Demonstration                                        | What to emphasize                                                                |
| --------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0:00–0:40 | Source & target, mapping table, assistant tool trace | One bounded dataset, supported tools only; AI has no write authority             |
| 0:40–1:20 | Two clarification decisions → new version            | Business semantics require human input; immutable versions preserve decisions    |
| 1:20–2:15 | Dry run → quarantined record inspection              | 120 = 108 + 12; original values, output, exact failed field/rule/code            |
| 2:15–3:00 | Approval dialog → execute                            | Exact fingerprints, reviewer attestation, separate execution action              |
| 3:00–3:40 | Retry → reconciliation                               | 0 new inserts, 108 skips; content hashes catch drift even when counts match      |
| 3:40–4:30 | Scoped rollback → activity trail                     | Target returns to zero; approvals, execution attempts and rollback reason remain |
| 4:30–5:00 | Export report or custom bundle                       | Evidence is portable; demo works without a paid API key                          |

## Distinguishing qualities

- The planner's authority is structurally restricted to four inspection/validation tools.
- Mapping and transformation proposals are checked against the actual schema and finite rule registry.
- Determinism and approval are enforced in the domain layer, not just by disabling UI buttons.
- Concurrent-tab retries are serialized by IndexedDB transactions.
- Every rejected row carries evidence; no row silently disappears.
- Reconciliation compares content as well as totals.
- Rollback is scoped to ownership provenance and preserves the entire history.
- The demo provider is plainly labeled; live failures never masquerade as successful AI output.
- The interface supports responsive navigation, native accessible dialogs, keyboard use and evidence export.

## Honest scope

One active source, one target, maximum 500 rows/32 fields/1 MB. Target persistence is local to the browser. There is no authenticated multi-user approval, production connector, arbitrary code execution, distributed migration or tamper-proof audit service. Optional live planning requires a provider key on the server. The competition can evaluate the full deterministic lifecycle using the included demo.

## Evidence

See [RELEASE.md](RELEASE.md) for executed verification results, [ARCHITECTURE.md](ARCHITECTURE.md) for trust boundaries, and the repository's commit history for phased delivery.

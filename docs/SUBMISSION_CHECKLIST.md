# Submission requirements audit

Audited against the supplied “Requirements and Submission” screenshot on October 6, 2026. The detailed migration-workbench assignment remains the implemented problem.

| Requirement                                                 | Implementation/evidence                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Usable frontend                                             | Responsive workbench, mapping editor, validation ledger, target inspector and Activity views                                                                 |
| Working backend                                             | Live `POST /api/plan` Node route; bounded real OpenAI tool loop; availability `GET /api/plan`                                                                |
| Basic persistence                                           | Atomic IndexedDB snapshots, cross-tab retry serialization and reload tests                                                                                   |
| Functional AI/LLM workflow                                  | Real hosted OpenAI proposal verified; initial demo is separately labeled                                                                                     |
| Human review/approval                                       | Blocking clarification decisions, immutable versions, explicit fingerprint-bound approval before execution; scoped rollback attestation                      |
| Loading states                                              | Workspace loader, proposal progress, busy/disabled actions                                                                                                   |
| Empty states                                                | No validation yet, no active plan and empty mock target                                                                                                      |
| Validation states                                           | Import contract checks, row quarantine and field/rule/error evidence                                                                                         |
| Success/failure states                                      | Operation notices, approved/committed/balanced/rolled-back states, provider errors, conflict and recovery messages                                           |
| Structured application logs                                 | Persistent hash-chained Activity JSON and execution attempts                                                                                                 |
| Structured AI workflow logs                                 | Passed/blocked plan tool traces and correlated server JSON events, including failure/repair; [LOGGING.md](LOGGING.md)                                        |
| Focused tests                                               | Domain, storage, agent, origin/API, log privacy/correlation, browser lifecycle, accessibility and short-viewport footer regression                           |
| Hosted deployment                                           | [Public production application](https://relay-migration-workbench.vercel.app); GitHub-connected Vercel project                                               |
| README setup and architecture                               | Root [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [DEPLOYMENT.md](DEPLOYMENT.md)                                                        |
| Completed/excluded scope, tests and limitations             | README implementation table/trust boundaries, [RELEASE.md](RELEASE.md) and [SUBMISSION.md](SUBMISSION.md)                                                    |
| Agent tools, prompts, delegation, mistakes and verification | Required root [AGENT_USAGE.md](../AGENT_USAGE.md)                                                                                                            |
| Configuration names without credentials                     | Root [.env.example](../.env.example); private configuration ignored by Git                                                                                   |
| Sample inputs and reviewer access in remarks                | Public synthetic [JSON bundle](../public/examples/customer-migration.json) and [paste-ready remarks](SUBMISSION_REMARKS.md); no account credentials required |
| Keep hosting and real AI operational through review         | Deployment/provider configuration remain enabled; owner review-period checklist in submission remarks                                                        |
| Submit within 48 hours                                      | Portal action remains with the owner; preparation does not submit the form                                                                                   |

The mock target and approval identity are browser-local, as documented. A shared production database, authenticated multi-user approval and an AgentGuard runtime daemon are excluded rather than claimed as completed features.

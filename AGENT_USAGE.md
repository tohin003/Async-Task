# Agent usage and verification

This document records both the AI workflow inside Relay and the coding-agent assistance used to build it. They have different capabilities and trust boundaries.

## Application agent

The live planner uses the OpenAI Responses API with the server-configured model (`gpt-4.1` on the submitted deployment; the unconfigured model fallback remains `gpt-4.1-mini`). It receives source/target schemas and bounded aggregate profiles. It cannot read raw source rows. The initial seeded proposal and optional demo provider are explicitly labeled deterministic demo output.

| Tool                      | Input                  | Output and authority                                                                                                     |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `inspect_schemas`         | Empty object           | Provided source and target definitions; no mutation                                                                      |
| `profile_source`          | Empty object           | Counts, observed types, whitespace/format issues and safe categorical frequencies; no raw rows or sampled contact values |
| `inspect_transformations` | Empty object           | Finite rule registry, typed argument guidance and scope limits                                                           |
| `validate_proposal`       | Complete proposed plan | Runtime schema, actual-field, supported-rule, categorical/type and clarification checks; invalid suggestions are blocked |

The agent has no approval, execution, rollback, database, browser, filesystem or arbitrary-code tool. Seven rounds, twelve calls and a 90-second deadline bound each live request. Tool arguments and final output use strict schemas. Invalid output receives bounded repair feedback; failed requests preserve the current plan and do not silently switch to the demo provider.

The request schema restricts mapping sources and targets, risk fields and question targets to the actual supplied schemas. AI clarification resolutions are constrained to null; human decisions remain separate. Tools are required during inspection; after all three evidence tools pass, the runtime forces `validate_proposal`, following the [OpenAI tool-selection API](https://developers.openai.com/api/docs/guides/function-calling). GPT-4.1 models use temperature zero to reduce exploratory variation. This does not make AI proposals deterministic; the approved dry-run engine owns determinism.

## Representative application prompts

The system instructions in [live-planner.ts](src/lib/live-planner.ts) include these rules:

> Use only the provided inspection and validation tools. Request inspect_schemas, profile_source and inspect_transformations together first. Propose a mapping for EVERY target field, with source=null for missing fields. Never invent fields, infer consent, execute code, approve a plan or resolve a user clarification.

They also require blocking user clarification for defaults or changed enum meaning, correct JSON output types, and trim rules when aggregate evidence shows whitespace. Schema descriptions and category labels are treated as untrusted data.

A representative generated user prompt is:

```text
Plan migration for bounded dataset "Customer registry migration" with 120 rows.
Inspect the provided tools before proposing.
```

Representative validation feedback asks the agent to map the observed `enabled/disabled/hold` labels, produce actual boolean `true/false` values, or obtain a blocking clarification. It cannot resolve those questions itself.

## Human review

The operator reviews mappings, risks and tool evidence, answers clarifications and runs the deterministic dry run. Clarification decisions and edits create immutable plan versions. A separate approval action requires a reviewer name and attestation to the exact plan and dry-run fingerprints. Execution recomputes validation and verifies that approval before writing. Retry, reconciliation and rollback remain operator actions. Reviewer names are browser-local attestations rather than authenticated enterprise identities.

## Coding-agent assistance and delegated work

Codex assisted with architecture, implementation, tests, UI review, documentation, meaningful Git commits and the authorized Vercel deployment. Development tools included repository/file inspection, shell commands, Git/GitHub, Vitest, Playwright/axe-core, and authorized Vercel CLI/REST operations. Those development capabilities are not exposed to Relay's application agent.

Representative development requests, paraphrased with credentials omitted:

- Build the migration workbench in phases, enforce user approval before execution, and push each completed phase to the supplied GitHub repository.
- Inspect the supplied AgentGuard before choosing an integration and document its actual supported capabilities.
- Deploy to the authorized Vercel account, configure a server-only OpenAI key, and verify the real hosted AI workflow.
- Audit the submission against the supplied requirements and fix the clipped sidebar footer.

No subagent work was delegated. The work remained in the main coding-agent session. API keys and deployment tokens were read only from authorized private configuration and were never included in repository examples, prompts in this document, client assets or submission remarks.

AgentGuard's actual Python `RepoIndex` was invoked through the optional development adapter. Its TypeScript extractor was unavailable. Relay therefore uses original TypeScript runtime guards and does not claim to run an AgentGuard daemon or SDK in Vercel. [Recorded inspection evidence](docs/agentguard-inspection.json).

## Important mistakes and rejected suggestions

| Observed issue                                                         | Rejection or correction                                                                           | Verification                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Invented source status labels matching the target enum                 | Aggregate categorical evidence was added; pipelines rejecting every observed category are blocked | Planner regressions and real hosted proposals                         |
| Defaults or changed enum meanings without user questions               | Require blocking clarification for the affected target                                            | Guard tests; approval stays disabled until decisions are recorded     |
| Enum lookup produced strings `"true"` / `"false"` for a boolean target | Validate observed categories against every target type; require typed booleans or `to_boolean`    | Exact regression for the failed mapping and real production lifecycle |
| Candidate format checks hid surrounding whitespace                     | Expose whitespace counts; require trim before strict email/date/boolean parsing                   | Missing-trim regression and source-profile evidence                   |
| Final JSON was wrapped in a `proposal` object                          | Strict output schema, exact-wrapper handling and bounded repair                                   | Wrapped/invalid output regressions; no approval bypass                |
| The initial provider deadline was too short for a hosted request       | Align the 90-second provider, 110-second browser and 120-second Vercel limits                     | Fake-time cancellation test and real live runs                        |
| Public requests were rejected behind a proxy                           | Validate incoming host and forwarded scheme                                                       | Origin/proxy regression tests and public browser checks               |
| Sidebar content exceeded short browser heights                         | Independently scroll navigation/resources and reserve the footer inside the dynamic viewport      | Short desktop/mobile viewport regression                              |

## How output was verified

A hosted check also caught repeated invalid suggestions exhausting the seven-round budget. The runtime now forces validation after inspection and constrains generated field choices to the actual schemas. Failed requests preserve bounded inspection/validation evidence for the requesting operator; sensitive detail strings remain excluded from server logs. Tool-selection, grounded-schema and budget-exhaustion regressions verify these policies.

A subsequent draft incorrectly removed provided fields when confirmation was pending. Prompt and validation feedback now distinguish conditional proposed rules from approved rules and supply a concrete blocking-question template. Confirmations do not require discarding mappings. Genuinely missing or incompatible fields can still remain unmapped for operator review. The hosted review model was configured to the available full `gpt-4.1` after these observed mini-model planning failures; the same runtime guards and request budgets apply.

Proposals pass Zod contracts, actual-field references, the finite transformation registry and semantic checks. The deterministic engine accounts for every row and retains original/transformed field errors. Tests cover approval binding, unsupported rules, invalid records, target conflicts, concurrent retries, drift and ownership-scoped rollback. Browser tests cover the whole lifecycle, persistence, mobile layout and accessibility.

The opt-in `npm run test:live` makes a real provider request in a fresh **synthetic** browser workspace, then records fixture decisions, approves, executes, retries, reloads, reconciles and rolls back. Scripted test approval never applies to a visitor's dataset. [Production evidence](docs/live-verification.json) and [release checks](docs/RELEASE.md) record actual results; controlled provider fixtures alone are not claimed as real-provider verification.

Application events and approved plan tool traces persist in IndexedDB and can be exported. Server JSON logs include request identity, timings, round/tool outcomes and classified failures without prompts, schemas, values, headers or credentials. [Log format and access](docs/LOGGING.md).

# Submission remarks

Copy the following text into the submission portal's remarks field. It contains no production credentials.

---

Project: Relay — Agentic Data Migration Planner and Reconciliation Workbench

Live application: https://relay-migration-workbench.vercel.app

Repository: https://github.com/tohin003/Async-Task

Reviewer access: No login or test-account credentials are required. The real OpenAI planner is configured on the server. Do not enter an API key. A reviewer name such as “Competition Reviewer” is a local approval attestation, not an account password.

Sample inputs: A synthetic 120-record customer registry, its source/target schemas and supported rules are preloaded. The same JSON bundle is downloadable at https://relay-migration-workbench.vercel.app/examples/customer-migration.json and is committed at public/examples/customer-migration.json.

To evaluate the AI, select “Generate new proposal,” review mappings and tool outcomes, answer the generated clarification questions, and run a dry run. The agent can only inspect and validate; it cannot approve or write target records. Provider errors remain visible and preserve the current plan.

For the deterministic seeded walkthrough, resolve the two initial questions: missing lifetime values may default to zero for this synthetic sample; enabled/disabled/hold translate to active/inactive/paused. The dry run yields 120 source, 108 accepted and 12 quarantined. Review and explicitly approve, execute, retry (0 new inserts, 108 skips), reconcile, then roll back. Inspect a quarantined record for field-level evidence and export Activity history.

Each reviewer has an isolated IndexedDB mock target. Refresh preserves plans and history in that browser/origin. Live-plan counts can differ when missing values are quarantined instead of defaulted. One source, one target, maximum 500 records, 32 fields per schema and 1 MB per bundle. Production databases, arbitrary transformation code, distributed migration and cloud connectors are intentionally excluded.

README.md contains setup, architecture, scope, tests, limitations and deployment details. AGENT_USAGE.md records tools, representative prompts, delegated-work status, rejected suggestions and output verification. docs/RELEASE.md and docs/live-verification.json contain executed test evidence. .env.example contains configuration names only.

---

## Owner checklist before submitting

- Paste the live URL, repository URL and remarks above into the required portal fields.
- Submit within the portal's 48-hour window; the screenshot's countdown is not a live clock.
- Keep the current Vercel production project and server AI configuration active until review is complete. The deployment has no application-defined shutdown or review expiry.
- Retain provider quota/billing for real reviewer AI requests. A demo-only fallback does not satisfy the required operational AI functionality.
- Check the live homepage and generate a real proposal before the review period. Use `LIVE_CHECK_URL=https://relay-migration-workbench.vercel.app npm run test:live` for the full opt-in paid synthetic check.

This repository preparation does not submit the portal form or disclose hosting/provider account credentials.

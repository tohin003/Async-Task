# Application and AI workflow logs

## Persistent application history

The **Activity** view stores structured events for dataset import, plan versions, dry runs, approvals, execution, retry, reconciliation and rollback. Each event has an ID, type, plan reference, actor, timestamp and chained hashes. **Export history** downloads the JSON evidence. Plan versions preserve the agent's passed/blocked tool trace; workspace export includes it. Execution attempts retain conflicts and failed outcomes.

These records are browser-local. They persist through reload and are separate from server logs. Hash chaining detects accidental damage, not tampering by someone who controls browser storage.

## Server planning logs

Every `POST /api/plan` generates a fresh request UUID, emits structured JSON lines and returns `X-Request-Id`. Failed responses also include the request ID. Events cover request start, provider rounds, tool outcomes, repair, completion, rejected input/authentication and provider failure/timeout.

Provider failures can return the requesting operator's bounded inspection/validation trace in the response. This supports diagnosis of rejected suggestions while preserving the current plan. Those detail strings are not serialized into server logs; server logs retain only tool names/statuses and classified outcomes.

Example format (illustrative metadata):

```json
{
  "version": 1,
  "service": "relay.planner",
  "timestamp": "2026-10-06T12:00:00.000Z",
  "requestId": "63a8006b-b08c-43c6-a02b-3fd6952c0a94",
  "elapsedMs": 250,
  "event": "tool.completed",
  "round": 2,
  "tool": "validate_proposal",
  "status": "blocked"
}
```

Only explicitly selected metadata is serialized. Unknown tool names become `unknown`. Prompts, schemas, source/transformed records, tool arguments, authorization headers, keys, tokens and raw exception messages are excluded. Failure codes include `INVALID_INSPECTION`, `UNAUTHORIZED`, `PROVIDER_FAILURE` and `PROVIDER_TIMEOUT`.

The deployment owner can inspect **Vercel → Project → Logs** or use an authenticated CLI:

[Actual production log evidence](planner-log-verification.json) records the synthetic live request's rounds, tool checks and completion, plus the invalid-inspection request's classified rejection. The request IDs also appear in the [live lifecycle verification report](live-verification.json).

```bash
vercel logs --environment production --since 30m --json
```

Filter for `relay.planner` and the returned request UUID. Locally, JSON lines appear in the Next.js server terminal. Reviewers can inspect successful/blocked tool evidence and application history inside the app without Vercel account access. Server-log access is intentionally restricted to the deployment owner. Log retention follows the hosting account; there is no separate durable centralized log service in this bounded mock.

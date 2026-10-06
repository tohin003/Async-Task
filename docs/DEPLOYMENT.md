# Vercel deployment

## Zero-configuration demo

1. In Vercel, import `https://github.com/tohin003/Async-Task`.
2. Keep the root directory at the repository root.
3. Select the Next.js framework preset and Node.js 24.
4. Install with `npm ci` and build with `npm run build`.
5. Deploy. No database, cloud connector, server-disk persistence or environment variable is required for the demo.

The project uses standard App Router routes. `/` is prerendered; `/api/plan` is a dynamic Node route with a 60-second maximum duration and an internal 45-second provider deadline. Vercel handles Next.js output; do not override the output directory.

## Optional live planning

Configure `OPENAI_API_KEY`, optionally `OPENAI_MODEL` (default `gpt-4.1-mini`), and preferably `PLANNER_ACCESS_TOKEN` on public deployments. These are server-only environment variables; do not prefix them with `NEXT_PUBLIC_`. Redeploy after changing them. The planner uses the OpenAI Responses API with `store: false`, a fixed provider endpoint, four bounded tools and strict output validation.

Configure Workspace settings in the application and select the live provider. If protected, enter the bearer access token. It is kept in memory only. Schema definitions and aggregate field profiles are sent to the provider; no raw records are available to any planning tool. The token is not included in workspace exports.

An access token protects paid provider usage. This demo intentionally has no account system or durable distributed rate limiter. The bounded per-request tool/time budgets are not an account-level spending cap.

## CLI deployment

```bash
vercel login
vercel                  # preview deployment
vercel --prod           # publish after checking the preview
```

Never commit API keys, Vercel tokens, `.env.local`, or `.vercel` project credentials. Existing environment tokens may override a saved CLI login; use a current login or valid deployment token.

## After deployment

- Load the app and verify the demo's 120-record source.
- Resolve clarifications, validate, approve, execute, retry and roll back.
- Verify reload persistence on the same origin.
- Confirm that another browser/profile starts with an isolated target.
- Check `/api/plan` returns availability only, never secrets.
- When live mode is enabled, verify the real provider using your own key; controlled test fixtures cannot establish provider/account availability.

Changing the deployment origin creates a different IndexedDB workspace. Preview and production URLs do not share mock data. Export reports before changing origin or clearing browser storage.

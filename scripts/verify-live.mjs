import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Explicit, opt-in paid-provider smoke test in a fresh synthetic browser workspace.
const url = process.env.LIVE_CHECK_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const availability = await (await page.request.get(new URL('/api/plan', url).href)).json();
  if (!availability.liveAvailable) throw new Error('Live planning is not configured at this URL.');
  if (availability.tokenRequired) {
    if (!process.env.PLANNER_ACCESS_TOKEN)
      throw new Error('This deployment requires PLANNER_ACCESS_TOKEN for the live check.');
    await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption('live');
    await page.getByLabel('Live planner access token').fill(process.env.PLANNER_ACCESS_TOKEN);
    await page.getByRole('button', { name: 'Save preferences' }).click();
  }
  await page.getByText('Live AI planner', { exact: true }).waitFor();
  const planningStarted = Date.now();
  const pending = page.waitForResponse(
    (response) => response.url().endsWith('/api/plan') && response.request().method() === 'POST',
    { timeout: 125_000 },
  );
  await page.getByRole('button', { name: 'Generate new proposal' }).click();
  const response = await pending;
  const planningDurationMs = Date.now() - planningStarted;
  const result = await response.json();
  if (!response.ok())
    throw new Error(`Live planning failed (${response.status()}): ${result.error}`);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/live-proposal.json', JSON.stringify(result, null, 2) + '\n');
  expect(result.provider).toBe('live');
  await expect(page.getByLabel('Plan version')).toHaveValue('plan-2');
  if (result.proposal.questions.length) {
    await page.getByRole('button', { name: 'Review clarifications' }).click();
    const fields = page.getByRole('dialog').locator('textarea');
    for (let i = 0; i < (await fields.count()); i++)
      await fields
        .nth(i)
        .fill(
          'Synthetic deployment verification: reviewed against the supplied customer fixture. Missing spend may default to zero; enabled/disabled/hold mean active/inactive/paused. Preserve strict validation and quarantine invalid data.',
        );
    await page.getByRole('button', { name: 'Save decisions as new version' }).click();
    await expect(page.getByLabel('Plan version')).toHaveValue('plan-3');
  }
  const version = Number((await page.getByLabel('Plan version').inputValue()).replace('plan-', ''));
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await page.getByText('Every record accounted for.').waitFor();
  const counts = (await page.locator('.validation-banner p').innerText()).match(
    /(\d+) source = (\d+) accepted \+ (\d+) quarantined/,
  );
  if (!counts) throw new Error('Validation count evidence is missing.');
  const source = Number(counts[1]),
    accepted = Number(counts[2]),
    rejected = Number(counts[3]);
  if (accepted === 0) {
    await page
      .getByRole('button', { name: /Inspect source row/ })
      .first()
      .click();
    await writeFile(
      'test-results/live-failure-evidence.txt',
      await page.getByRole('dialog').innerText(),
    );
  }
  expect(source).toBe(120);
  expect(accepted).toBeGreaterThanOrEqual(100);
  expect(accepted).toBeLessThanOrEqual(108);
  expect(accepted + rejected).toBe(source);
  await page.getByRole('button', { name: 'Review & approve' }).click();
  await page.getByRole('dialog').getByLabel('Reviewer name').fill('Synthetic deployment test');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button', { name: `Approve plan v${version}` }).click();
  await page.getByRole('button', { name: 'Execute approved migration' }).click();
  await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry migration safely' }).click();
  const retry = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '#2', exact: true }) });
  await expect(retry.locator('td').nth(2)).toHaveText('0');
  await expect(retry.locator('td').nth(3)).toHaveText(String(accepted));
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Reconciliation' }).click();
  await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await page.getByRole('button', { name: 'Roll back migration', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reviewer name').fill('Synthetic deployment test');
  await page
    .getByRole('dialog')
    .getByLabel('Rollback reason')
    .fill('Live provider and reversible migration verified in an isolated synthetic workspace.');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm rollback' }).click();
  await expect(page.getByText('Your mock target is empty')).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /Activity/ })
    .click();
  await expect(
    page.locator('.timeline-title strong').filter({ hasText: 'Migration rolled back' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  const report = {
    url,
    verifiedAt: new Date().toISOString(),
    provider: result.provider,
    model: availability.model,
    planningDurationMs,
    fixture: 'Isolated synthetic customer registry; scripted test approvals only',
    source,
    accepted,
    rejected,
    firstInsert: accepted,
    retryInsert: 0,
    retrySkipped: accepted,
    targetAfterRollback: 0,
    reloadPreserved: true,
    historyPreserved: true,
    tools: result.trace.map((t) => ({ tool: t.tool, status: t.status })),
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/live-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}

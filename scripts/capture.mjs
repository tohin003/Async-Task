import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Capture real production UI using a fresh, isolated mock workspace.
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
try {
  await mkdir('docs/screenshots', { recursive: true });
  await page.goto(process.env.CAPTURE_URL || 'http://127.0.0.1:3000');
  await page.getByRole('heading', { name: 'Migration workbench.' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshots/workbench.png', fullPage: true });
  await page.getByRole('button', { name: 'Resolve questions', exact: true }).click();
  await page
    .getByLabel('Decision for total_spend')
    .fill('Confirmed: a missing lifetime value may default to zero in this bounded dataset.');
  await page
    .getByLabel('Decision for status')
    .fill('Confirmed: the legacy hold state means paused.');
  await page.getByRole('button', { name: 'Save decisions as new version' }).click();
  await page.getByLabel('Plan version').selectOption('plan-2');
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await page.getByText('Every record accounted for.').waitFor();
  await page.getByRole('button', { name: 'Quarantined 12' }).click();
  await page.screenshot({ path: 'docs/screenshots/validation.png', fullPage: true });
  await page.getByRole('button', { name: 'Review & approve' }).click();
  await page.getByRole('dialog').getByLabel('Reviewer name').fill('Submission reviewer');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve plan v2' }).click();
  await page.getByRole('button', { name: 'Execute approved migration' }).click();
  await page.getByText('Balanced', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry migration safely' }).click();
  await page.getByRole('cell', { name: '#2', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await page.screenshot({ path: 'docs/screenshots/reconciliation.png', fullPage: true });
  await page.getByRole('button', { name: 'Roll back migration', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reviewer name').fill('Submission reviewer');
  await page
    .getByRole('dialog')
    .getByLabel('Rollback reason')
    .fill('Reversibility demonstrated; preserve all evidence.');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm rollback' }).click();
  await page.getByRole('heading', { name: 'Migration rolled back', exact: true }).waitFor();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /Activity/ })
    .click();
  await page.screenshot({ path: 'docs/screenshots/activity.png', fullPage: true });
  console.log(
    'Captured workbench, validation, reconciliation and activity from the real production build.',
  );
} finally {
  await browser.close();
}

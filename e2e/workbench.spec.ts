import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function resolve(page: Page) {
  await page.getByRole('button', { name: 'Resolve questions', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Decision for total_spend' })
    .fill('Confirmed: missing lifetime values may default to zero for this bounded sample.');
  await page
    .getByRole('textbox', { name: 'Decision for status' })
    .fill('Confirmed: hold means paused in the new customer registry.');
  await page.getByRole('button', { name: 'Save decisions as new version' }).click();
  await expect(page.getByLabel('Plan version')).toHaveValue('plan-2');
}
async function approve(page: Page) {
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await expect(page.getByText('Every record accounted for.')).toBeVisible();
  await page.getByRole('button', { name: 'Review & approve' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Reviewer name' }).fill('Competition Judge');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Approve plan v2' }).click();
  await expect(page.getByText('Approved by', { exact: false }).first()).toBeVisible();
}
test('complete lifecycle, quarantine evidence, safe retry, reload and rollback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Migration workbench.' })).toBeVisible();
  await resolve(page);
  await approve(page);
  await page.getByRole('button', { name: 'Execute approved migration' }).click();
  await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry migration safely' }).click();
  await expect(page.getByRole('cell', { name: '#2', exact: true })).toBeVisible();
  await expect(
    page.getByRole('row').filter({ has: page.getByRole('cell', { name: '#2', exact: true }) }),
  ).toContainText('108');
  await page.reload();
  await expect(page.getByLabel('Plan version')).toHaveValue('plan-2');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /Validation/ })
    .click();
  await page.getByRole('button', { name: 'Quarantined 12' }).click();
  await page.getByRole('button', { name: 'Inspect source row 9' }).click();
  await expect(page.getByRole('dialog').getByText('INVALID_EMAIL', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Failed rule')).toBeVisible();
  await page.getByRole('button', { name: 'Close inspection' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Reconciliation' })
    .click();
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await page.getByRole('button', { name: 'Roll back migration', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Reviewer name' }).fill('Competition Judge');
  await dialog
    .getByRole('textbox', { name: 'Rollback reason' })
    .fill('Reversibility demonstration complete.');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirm rollback' }).click();
  await expect(
    page.getByRole('heading', { name: 'Migration rolled back', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Your mock target is empty')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /Activity/ })
    .click();
  await expect(page.getByRole('strong').filter({ hasText: 'Migration retried' })).toBeVisible();
  await expect(
    page.getByRole('strong').filter({ hasText: 'User approval recorded' }),
  ).toBeVisible();
  await expect(
    page.locator('.timeline-title strong').filter({ hasText: 'Migration rolled back' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('cannot approve unresolved questions or execute a draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Reconciliation' }).click();
  await expect(page.getByRole('button', { name: 'Execute approved migration' })).toBeDisabled();
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await page.getByRole('button', { name: 'Review & approve' }).click();
  await expect(
    page.getByRole('dialog').getByText('Resolve 2 required clarifications before approval.'),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Reviewer name' }).fill('Judge');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Approve plan v1' })).toBeDisabled();
});
test('mapping edits create a new version and invalidate prior validation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit mapping for name' }).click();
  await page.getByRole('button', { name: 'Add rule' }).click();
  await page.getByLabel('Transformation 2', { exact: true }).selectOption('uppercase');
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByLabel('Plan version')).toHaveValue('plan-2');
  await expect(page.getByRole('button', { name: 'Run dry run', exact: true })).toBeVisible();
  await page.getByLabel('Plan version').selectOption('plan-1');
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Edit mapping for name' }) }),
  ).not.toContainText('Uppercase');
});
test('imports a bounded custom bundle and preserves its source', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import dataset', exact: true }).click();
  const bundle = {
    name: 'Judge fixture',
    sourceSchema: {
      name: 'legacy',
      primaryKey: 'id',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'email', type: 'string', required: true },
      ],
    },
    targetSchema: {
      name: 'target',
      primaryKey: 'id',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'email', type: 'email', required: true },
      ],
    },
    records: [
      { id: 'one', email: ' USER@EXAMPLE.COM ' },
      { id: 'two', email: 'invalid' },
    ],
  };
  await page.getByLabel('Choose JSON dataset').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page.getByText('Contract verified')).toBeVisible();
  await page.getByRole('button', { name: 'Load dataset & propose plan' }).click();
  await expect(page.getByLabel('Plan version')).toHaveValue('plan-2');
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await expect(
    page.getByText('2 source = 1 accepted + 1 quarantined. Deterministic and repeatable.'),
  ).toBeVisible();
});
test('mobile navigation works and the page has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Migration workbench.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Source & target' }).click();
  await expect(
    page.getByRole('heading', { name: 'One source. One target. A clear boundary.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('workbench has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Migration workbench.' })).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
  ).toEqual([]);
});

test('approval, field evidence, source, target and history remain accessible', async ({ page }) => {
  const audit = async (state: string) => {
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations
        .filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
        .map((v) => ({ state, id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  };
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Source & target' }).click();
  await audit('source inspection');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Workbench', exact: true })
    .click();
  await resolve(page);
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await page.getByText('Every record accounted for.').waitFor();
  await audit('validation');
  await page.getByRole('button', { name: 'Quarantined 12' }).click();
  await page.getByRole('button', { name: 'Inspect source row 9' }).click();
  await audit('field evidence dialog');
  await page.getByRole('button', { name: 'Close inspection' }).click();
  await page.getByRole('button', { name: 'Review & approve' }).click();
  await audit('approval dialog');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Reviewer name' }).fill('Judge');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Approve plan v2' }).click();
  await page.getByRole('button', { name: 'Execute approved migration' }).click();
  await page.getByText('Balanced', { exact: true }).waitFor();
  await audit('target reconciliation');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /Activity/ })
    .click();
  await audit('audit history');
});

import type { Locator } from '@playwright/test';

/** Select through the visible menu; native editor fields retain their normal path. */
export async function selectOption(control: Locator, value: string) {
  if (await control.evaluate((element) => element.tagName === 'SELECT')) {
    await control.selectOption(value);
    return;
  }
  const label = await control.evaluate((element, value) => {
    const mirror = element.closest('.shared-select')?.querySelector('select');
    return Array.from(mirror?.options ?? []).find(
      (option) => option.value === `option:${value}`,
    )?.text;
  }, value);
  if (!label) throw new Error(`Select option ${value} is unavailable`);
  await control.click();
  await control
    .page()
    .getByRole('option', { name: label, exact: true })
    .click();
}

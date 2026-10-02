import { screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/** Exercise the visible menu while keeping fixture values shared with native fields. */
export async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  control: HTMLElement,
  value: string,
) {
  if (control instanceof HTMLSelectElement) {
    await user.selectOptions(control, value);
    return;
  }
  const label = await waitFor(() => {
    const mirror = control.closest('.shared-select')?.querySelector('select');
    const option = Array.from(mirror?.options ?? []).find(
      (item) => item.value === `option:${value}`,
    );
    if (!option) throw new Error(`Select option ${value} is unavailable`);
    return option.text;
  });
  await user.click(control);
  await user.click(screen.getByRole('option', { name: label }));
}

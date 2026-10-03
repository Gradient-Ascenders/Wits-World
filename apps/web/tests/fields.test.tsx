import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SearchField } from '../src/components/fields/SearchField';
import { SelectField } from '../src/components/fields/SelectField';

describe('shared filter fields', () => {
  it('clears a controlled search and restores focus to the input', async () => {
    const user = userEvent.setup();
    function Search() {
      const [value, setValue] = useState('');
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <SearchField
          label="Search cards"
          inputRef={inputRef}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Search />);
    const input = screen.getByRole('searchbox', { name: 'Search cards' });
    await user.type(input, 'Campus');
    await user.click(
      screen.getByRole('button', { name: 'Clear search cards' }),
    );
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Clear search cards' }),
    ).not.toBeInTheDocument();
  });

  it('preserves empty filter values, skips disabled options, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    function Filter() {
      const [value, setValue] = useState('published');
      return (
        <SelectField
          label="Lifecycle"
          value={value}
          onChange={setValue}
          options={[
            { value: '', label: 'All content' },
            { value: 'draft', label: 'Draft', disabled: true },
            { value: 'published', label: 'Published' },
          ]}
        />
      );
    }
    render(<Filter />);
    const trigger = screen.getByLabelText('Lifecycle');
    await user.click(trigger);
    expect(screen.getByRole('option', { name: 'Draft' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('option', { name: 'All content' }));
    expect(trigger).toHaveTextContent('All content');
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps form validation on the focusable trigger and associates its error', () => {
    render(
      <SelectField
        id="modifier-stat"
        label="Modifier stat"
        error="Choose a modifier stat."
        value=""
        onChange={() => {}}
        options={[{ value: '', label: 'Choose stat' }]}
      />,
    );
    const trigger = screen.getByLabelText('Modifier stat');
    expect(trigger).toHaveAttribute('id', 'modifier-stat');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Choose a modifier stat.');
    document.querySelector<HTMLElement>('#modifier-stat')?.focus();
    expect(trigger).toHaveFocus();
  });

  it('prevents a disabled filter from opening', async () => {
    const user = userEvent.setup();
    render(
      <SelectField
        label="Challenge"
        disabled
        value=""
        onChange={() => {}}
        options={[{ value: '', label: 'All challenges' }]}
      />,
    );
    const trigger = screen.getByLabelText('Challenge');
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

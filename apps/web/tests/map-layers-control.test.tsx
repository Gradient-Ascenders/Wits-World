import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MapLayersControl } from '../src/components/exploration/MapLayersControl';
import { DEFAULT_MAP_LAYER_VISIBILITY } from '../src/components/exploration/map-provider';

function LayersHarness() {
  const [visibility, setVisibility] = useState(DEFAULT_MAP_LAYER_VISIBILITY);
  return <MapLayersControl visibility={visibility} onChange={setVisibility} />;
}

describe('desktop map layers disclosure', () => {
  it('focuses the first toggle and keeps independent visibility choices', async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);
    await user.click(screen.getByRole('button', { name: 'Map layers' }));
    const markers = screen.getByRole('checkbox', { name: 'Event markers' });
    expect(markers).toHaveFocus();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    await user.click(markers);
    expect(markers).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Selected challenge radius' }),
    ).toBeChecked();
    await user.keyboard('{Escape}');
    const trigger = screen.getByRole('button', {
      name: 'Map layers',
    });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('checkbox', { name: 'Event markers' }),
    ).not.toBeChecked();
  });

  it('dismisses outside without moving focus away from the clicked control', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LayersHarness />
        <button type="button">Other control</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Map layers' }));
    await user.click(screen.getByRole('button', { name: 'Other control' }));
    expect(
      screen.queryByRole('region', { name: 'Map layers' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other control' })).toHaveFocus();
  });

  it('returns focus when the close button is used', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MapLayersControl
        visibility={DEFAULT_MAP_LAYER_VISIBILITY}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Map layers' }));
    await user.click(screen.getByRole('button', { name: 'Close map layers' }));
    expect(screen.getByRole('button', { name: 'Map layers' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });
});

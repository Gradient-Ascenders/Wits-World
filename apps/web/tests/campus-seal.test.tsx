import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CampusSeal } from '../src/components/branding/CampusSeal';

describe('CampusSeal', () => {
  it('renders the canonical SVG with meaningful branding text by default', () => {
    render(<CampusSeal />);

    const seal = screen.getByRole('img', { name: 'Wits World Campus Seal' });

    expect(seal).toHaveAttribute(
      'src',
      expect.stringContaining('wits-world-campus-seal-transparent.svg'),
    );
    expect(seal).toHaveAttribute('width', '321');
    expect(seal).toHaveAttribute('height', '347');
    expect(seal).toHaveClass('campus-seal');
  });

  it('supports custom alternative text and classes', () => {
    render(
      <CampusSeal alt="Wits World project seal" className="header-seal" />,
    );

    expect(
      screen.getByRole('img', { name: 'Wits World project seal' }),
    ).toHaveClass('campus-seal', 'header-seal');
  });

  it('hides decorative duplicate instances from assistive technology', () => {
    const { container } = render(<CampusSeal decorative />);
    const seal = container.querySelector('img');

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(seal).toHaveAttribute('alt', '');
    expect(seal).toHaveAttribute('aria-hidden', 'true');
  });
});

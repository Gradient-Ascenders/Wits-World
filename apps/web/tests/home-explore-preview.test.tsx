import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomeExplorePreview } from '../src/components/home/HomeExplorePreview';

describe('campus preview artwork', () => {
  it('reserves the original aspect ratio and lets lazy loading choose a density-appropriate source', () => {
    render(<HomeExplorePreview />);
    const image = screen.getByRole('img', {
      name: /Illustrated bird's-eye view/,
    });
    expect(image).toHaveAttribute('width', '1448');
    expect(image).toHaveAttribute('height', '1086');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image.getAttribute('sizes')).toMatch(/^auto,/);
    expect(image.getAttribute('srcset')?.match(/\d+w/g)).toEqual([
      '480w',
      '768w',
      '1152w',
      '1448w',
    ]);
    expect(
      screen.getByRole('link', { name: 'Explore campus from Great Hall' }),
    ).toHaveAttribute('href', '/explore');
  });
});

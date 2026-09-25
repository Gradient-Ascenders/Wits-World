import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HomeChallengeDemo } from '../src/components/home/HomeChallengeDemo';

describe('Home challenge demo', () => {
  it('runs five untimed questions, scores the result, and restarts', async () => {
    const user = userEvent.setup();
    render(<HomeChallengeDemo />);

    expect(screen.queryByText('Sample challenge')).not.toBeInTheDocument();
    expect(screen.queryByText('Demo · no score saved')).not.toBeInTheDocument();
    expect(screen.getByText(/Untimed demo/)).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Demo quiz progress' }),
    ).toHaveValue(0);
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'West Campus' }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));

    expect(screen.getByRole('status')).toHaveTextContent('Not quite.');
    expect(screen.getByRole('status')).toHaveTextContent(
      "The Great Hall is on the University's Braamfontein East Campus.",
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Not quite.' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Next question' }));

    expect(
      screen.getByRole('heading', {
        name: 'What does the name Wits stand for?',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'What does the name Wits stand for?',
        }),
      ).toHaveFocus(),
    );

    for (const answer of [
      'University of the Witwatersrand',
      'The Great Hall',
      'Wartenweiler Library',
      'Johannesburg',
    ]) {
      await user.click(screen.getByRole('radio', { name: answer }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));

      expect(screen.getByRole('status')).toHaveTextContent('That’s right.');
      await user.click(
        screen.getByRole('button', {
          name: answer === 'Johannesburg' ? 'See results' : 'Next question',
        }),
      );
    }

    expect(
      screen.getByRole('heading', { name: 'Quiz complete' }),
    ).toBeVisible();
    expect(screen.getByText('4 of 5')).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Demo quiz progress' }),
    ).toHaveValue(5);

    await user.click(
      screen.getByRole('button', { name: 'Try all five again' }),
    );

    expect(
      screen.getByRole('heading', {
        name: 'On which Wits campus is the Great Hall located?',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled();
    expect(
      screen.getByRole('progressbar', { name: 'Demo quiz progress' }),
    ).toHaveValue(0);
  });
});

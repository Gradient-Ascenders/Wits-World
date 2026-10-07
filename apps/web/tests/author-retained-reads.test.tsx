import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthorApiError } from '../src/api/author';
import {
  AuthorRetainedReads,
  useAuthorRetainedResource,
} from '../src/components/author/AuthorRetainedReads';

function Read({ resource, group }: { resource: string; group?: string }) {
  const { value, setValue, confirmed, previous, confirm, revoke, beginRead } =
    useAuthorRetainedResource<string | null>(resource, null, group);
  const pending = useRef<() => boolean>(() => false);
  return (
    <div>
      <p>
        {previous ? 'Previous query snapshot' : 'Current resource snapshot'}
      </p>
      <button
        onClick={() => {
          pending.current = beginRead();
        }}
      >
        Start read
      </button>
      <button
        onClick={() => {
          if (pending.current()) {
            setValue('Late response');
            confirm();
          }
        }}
      >
        Finish read
      </button>
      <p>{value ?? 'No confirmed content'}</p>
      <p>{confirmed ? 'Confirmed snapshot' : 'Needs first confirmation'}</p>
      <button
        onClick={() => {
          setValue(`Content for ${resource}`);
          confirm();
        }}
      >
        Confirm
      </button>
      <button
        onClick={() => revoke(new AuthorApiError('unavailable', 'Offline'))}
      >
        Offline
      </button>
      <button
        onClick={() =>
          revoke(new AuthorApiError('forbidden', 'Permission lost'))
        }
      >
        Revoke
      </button>
    </div>
  );
}
function Workspace({
  visible = true,
  resource = 'events',
  scope = 'one',
  group,
}: {
  visible?: boolean;
  resource?: string;
  scope?: string;
  group?: string;
}) {
  return (
    <AuthorRetainedReads key={scope}>
      {visible ? <Read resource={resource} group={group} /> : null}
    </AuthorRetainedReads>
  );
}

describe('Author console retained reads', () => {
  it('retains confirmed snapshots on revisits and isolates resources and account/API scope', () => {
    const view = render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    view.rerender(<Workspace visible={false} />);
    view.rerender(<Workspace />);
    expect(screen.getByText('Content for events')).toBeInTheDocument();
    view.rerender(<Workspace resource="questions:another-challenge" />);
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
    view.rerender(<Workspace />);
    expect(screen.getByText('Content for events')).toBeInTheDocument();
    view.rerender(<Workspace scope="another-account" />);
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
  });

  it('retains recoverable failures, but clears both visible and previously visited content on access loss', () => {
    const view = render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Offline' }));
    expect(screen.getByText('Content for events')).toBeInTheDocument();
    view.rerender(<Workspace resource="cards" />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
    view.rerender(<Workspace />);
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
  });

  it('labels prior queries within one report while clearing unrelated resource groups', () => {
    const view = render(<Workspace resource="report:page1" group="report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    view.rerender(<Workspace resource="report:page2" group="report" />);
    expect(screen.getByText('Content for report:page1')).toBeInTheDocument();
    expect(screen.getByText('Previous query snapshot')).toBeInTheDocument();
    view.rerender(
      <Workspace resource="another-report:page1" group="another-report" />,
    );
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
  });

  it('invalidates in-flight read epochs when a parallel request loses access', () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Start read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish read' }));
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish read' }));
    expect(screen.getByText('Late response')).toBeInTheDocument();
  });

  it('expires revisits after one minute and evicts beyond forty resource snapshots', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const view = render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    view.rerender(<Workspace visible={false} />);
    now.mockReturnValue(61_001);
    view.rerender(<Workspace />);
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
    now.mockRestore();
    for (let index = 0; index < 41; index += 1) {
      view.rerender(<Workspace resource={`history:${index}`} />);
      act(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' })),
      );
    }
    view.rerender(<Workspace resource="history:0" />);
    expect(screen.getByText('No confirmed content')).toBeInTheDocument();
    view.rerender(<Workspace resource="history:40" />);
    expect(screen.getByText('Content for history:40')).toBeInTheDocument();
  });
});

it('clears confirmed reads immediately on a sign-out binding event and ignores older reads', () => {
  const view = render(<Workspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start read' }));
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'unrelated-preference' }),
    ),
  );
  expect(screen.getByText('Content for events')).toBeVisible();
  act(() => window.dispatchEvent(new Event('wits-player-binding-change')));
  expect(screen.getByText('No confirmed content')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Finish read' }));
  expect(screen.queryByText('Late response')).toBeNull();
  view.rerender(<Workspace visible={false} />);
  view.rerender(<Workspace />);
  expect(screen.getByText('No confirmed content')).toBeVisible();
});

import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileEditor } from '../src/components/profile/ProfileEditor';
import { buildPlayerProfile } from './fixtures/player-profile';
import { jsonResponse } from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const encodedAvatar = 'data:image/jpeg;base64,downscaledavatar';

type LoadedImage = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
};

const images: LoadedImage[] = [];
const drawImage = vi.fn();
const fillRect = vi.fn();
let resize: (() => void) | undefined;

class MockImage {
  onload: LoadedImage['onload'] = null;
  onerror: LoadedImage['onerror'] = null;
  naturalWidth = 640;
  naturalHeight = 320;
  src = '';

  constructor() {
    images.push(this as LoadedImage);
  }
}

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resize = () => callback([], this as unknown as ResizeObserver);
  }

  observe(element: Element) {
    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      value: 200,
    });
    resize?.();
  }

  unobserve() {}
  disconnect() {}
}

function authValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  };
}

function withAuth(children: ReactNode) {
  return (
    <Auth0Context.Provider value={authValue()}>
      {children}
    </Auth0Context.Provider>
  );
}

function editor(profile = buildPlayerProfile(), onSaved = vi.fn()) {
  return render(
    withAuth(
      <ProfileEditor
        apiBaseUrl={apiBaseUrl}
        profile={profile}
        section="identity"
        onClose={vi.fn()}
        onSaved={onSaved}
        onReload={vi.fn()}
      />,
    ),
  );
}

function upload(file: File) {
  fireEvent.change(screen.getByLabelText('Choose picture'), {
    target: { files: [file] },
  });
}

function finishImage(index = images.length - 1) {
  act(() => images[index]!.onload?.());
}

function failImage(index = images.length - 1) {
  act(() => images[index]!.onerror?.());
}

function photo(name: string, type = 'image/png', bytes = 32) {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  images.length = 0;
  resize = undefined;
  drawImage.mockReset();
  fillRect.mockReset();
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    (file) => `blob:profile:${file instanceof File ? file.name : 'unknown'}`,
  );
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect,
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    encodedAvatar,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('profile avatar upload', () => {
  it('crops and downscales a selected image, then sends the encoded avatar through the real save request', async () => {
    const user = userEvent.setup();
    const profile = buildPlayerProfile();
    const saved = vi.fn();
    let submitted: Record<string, unknown> | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${apiBaseUrl}/profiles/me`);
      expect(init?.method).toBe('PUT');
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      });
      submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Promise.resolve(
        jsonResponse({
          ...profile,
          requestId: 'avatar-save',
          avatarDataUrl: encodedAvatar,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = editor(profile, saved);
    const file = photo('campus.png');
    upload(file);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing picture');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    finishImage();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled(),
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(drawImage).toHaveBeenCalledWith(
      images[0],
      160,
      0,
      320,
      320,
      0,
      0,
      256,
      256,
    );
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith(
      'image/jpeg',
      0.82,
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(submitted).toMatchObject({
      expectedVersion: 0,
      avatarDataUrl: encodedAvatar,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile:campus.png');
  });

  it('clears validation and decode errors when a replacement image is selected and revokes replaced sources', async () => {
    const view = editor();
    upload(photo('notes.gif', 'image/gif'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a JPEG, PNG or WebP image under 8 MB.',
    );
    expect(images).toHaveLength(0);

    upload(photo('broken.webp', 'image/webp'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    failImage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This image could not be read. Choose another picture.',
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:profile:broken.webp',
    );

    upload(photo('replacement.jpg', 'image/jpeg'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    finishImage();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled(),
    );
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:profile:replacement.jpg',
    );
  });

  it('shows a save network error, retains the cropped avatar, and allows a successful retry', async () => {
    const user = userEvent.setup();
    const profile = buildPlayerProfile();
    const saved = vi.fn();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        jsonResponse({
          ...profile,
          requestId: 'avatar-retry',
          avatarDataUrl: encodedAvatar,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    editor(profile, saved);
    upload(photo('retry.png'));
    finishImage();

    const save = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your connection and try again.',
    );
    expect(
      screen.getByRole('button', { name: 'Remove picture' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

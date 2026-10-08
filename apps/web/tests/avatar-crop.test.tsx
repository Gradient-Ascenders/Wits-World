import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_TIMEOUT_MS } from '../src/components/loading-policy';
import { AvatarCrop } from '../src/components/profile/AvatarCrop';

type ImageHarness = HTMLImageElement & {
  onload: ((event: Event) => void) | null;
  onerror: ((event: Event | string) => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
};

const imageLoads: ImageHarness[] = [];
const drawImage = vi.fn();
const fillRect = vi.fn();
const disconnect = vi.fn();
let resize: (() => void) | undefined;
const captureMethods = [
  'setPointerCapture',
  'hasPointerCapture',
  'releasePointerCapture',
] as const;
const captureDescriptors = captureMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);

class MockImage {
  onload: ImageHarness['onload'] = null;
  onerror: ImageHarness['onerror'] = null;
  naturalWidth = 400;
  naturalHeight = 200;
  src = '';

  constructor() {
    imageLoads.push(this as unknown as ImageHarness);
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
  disconnect() {
    disconnect();
  }
}

function loadedImage(index = imageLoads.length - 1) {
  act(() => imageLoads[index]!.onload?.(new Event('load')));
}

function setup(props: Partial<ComponentProps<typeof AvatarCrop>> = {}) {
  const onReady = vi.fn((data: string) => data);
  const onError = vi.fn();
  const file = new File(['photo'], 'profile.png', { type: 'image/png' });
  const result = render(
    <AvatarCrop
      file={file}
      disabled={false}
      onReady={onReady}
      onError={onError}
      {...props}
    />,
  );
  return { ...result, file, onReady, onError };
}

beforeEach(() => {
  imageLoads.length = 0;
  drawImage.mockReset();
  fillRect.mockReset();
  disconnect.mockReset();
  resize = undefined;
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId: number;
      isPrimary: boolean;
      constructor(type: string, options: PointerEventInit = {}) {
        super(type, options);
        this.pointerId = options.pointerId ?? 0;
        this.isPrimary = options.isPrimary ?? false;
      }
    },
  );
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(
        (file: File) => `blob:${file.name}:${imageLoads.length}`,
      ),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect,
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,crop',
  );
  for (const name of captureMethods) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      value: vi.fn(() => (name === 'hasPointerCapture' ? false : undefined)),
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [index, name] of captureMethods.entries()) {
    const descriptor = captureDescriptors[index];
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
});

describe('AvatarCrop', () => {
  it('waits for image decode, reports the crop, and draws a square source region', () => {
    const { onReady } = setup();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing picture');
    expect(
      screen.getByRole('button', { name: 'Move profile picture' }),
    ).toBeDisabled();

    loadedImage();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move profile picture' }),
    ).toBeEnabled();
    expect(onReady).toHaveBeenLastCalledWith('data:image/jpeg;base64,crop');
    expect(drawImage).toHaveBeenLastCalledWith(
      imageLoads[0],
      100,
      0,
      200,
      200,
      0,
      0,
      256,
      256,
    );
  });

  it('reports decode failures and times out an image that never settles', async () => {
    const failed = setup();
    act(() => imageLoads[0]!.onerror?.(new Event('error')));
    expect(failed.onError).toHaveBeenCalledOnce();
    failed.unmount();

    vi.useFakeTimers();
    const timedOut = setup();
    await act(async () => vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS));
    expect(timedOut.onError).toHaveBeenCalledOnce();
  });

  it('ignores a stale decode after the file changes and revokes both source URLs', () => {
    const { file, rerender, unmount, onReady, onError } = setup();
    const firstLoad = imageLoads[0]!;
    const nextFile = new File(['new photo'], 'next.png', { type: 'image/png' });
    rerender(
      <AvatarCrop
        file={nextFile}
        disabled={false}
        onReady={onReady}
        onError={onError}
      />,
    );

    act(() => firstLoad.onerror?.(new Event('error')));
    act(() => firstLoad.onload?.(new Event('load')));
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${file.name}:0`);
    loadedImage();
    expect(onReady).toHaveBeenCalledOnce();

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${nextFile.name}:1`);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the source crop square, clamps keyboard panning, and resets zoom and position', async () => {
    const user = userEvent.setup();
    const { onReady } = setup();
    loadedImage();
    const stage = screen.getByRole('button', { name: 'Move profile picture' });
    const zoom = screen.getByRole('slider', { name: 'Zoom' });

    fireEvent.change(zoom, { target: { value: '2' } });
    stage.focus();
    fireEvent.keyDown(stage, { key: 'ArrowLeft', shiftKey: true });

    expect(zoom).toHaveValue('2');
    expect(onReady).toHaveBeenLastCalledWith('data:image/jpeg;base64,crop');
    expect(drawImage).toHaveBeenLastCalledWith(
      imageLoads[0],
      162,
      50,
      100,
      100,
      0,
      0,
      256,
      256,
    );

    await user.click(screen.getByRole('button', { name: 'Reset crop' }));
    expect(zoom).toHaveValue('1');
    expect(drawImage).toHaveBeenLastCalledWith(
      imageLoads[0],
      100,
      0,
      200,
      200,
      0,
      0,
      256,
      256,
    );
  });

  it('supports pointer panning and ends a cancelled gesture without moving on later events', () => {
    const { onReady } = setup();
    loadedImage();
    const stage = screen.getByRole('button', { name: 'Move profile picture' });

    fireEvent.pointerDown(stage, {
      button: 0,
      isPrimary: true,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 7,
      clientX: -10_000,
      clientY: 100,
    });
    expect(onReady).toHaveBeenLastCalledWith('data:image/jpeg;base64,crop');
    expect(drawImage).toHaveBeenLastCalledWith(
      imageLoads[0],
      200,
      0,
      200,
      200,
      0,
      0,
      256,
      256,
    );

    fireEvent.pointerCancel(stage, { pointerId: 7 });
    const callsAfterCancel = drawImage.mock.calls.length;
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 20, clientY: 100 });
    expect(drawImage).toHaveBeenCalledTimes(callsAfterCancel);
  });

  it('disables every crop control when editing is unavailable', () => {
    setup({ disabled: true });
    loadedImage();

    expect(
      screen.getByRole('button', { name: 'Move profile picture' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Zoom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset crop' })).toBeDisabled();
  });
});

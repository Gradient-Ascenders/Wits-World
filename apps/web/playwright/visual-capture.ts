import { existsSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';

export function visualCapturesEnabled(): boolean {
  return process.env.PLAYWRIGHT_VISUAL_CAPTURE === '1';
}

function resolvedPhysicalPath(destination: string): string {
  let ancestor = destination;
  const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return path.resolve(realpathSync(ancestor), ...suffix);
}

function protectedPath(destination: string): boolean {
  return destination
    .split(/[\\/]/u)
    .some((part) => part.toLowerCase() === '.impeccable');
}

export function visualCapturePath(
  info: Pick<TestInfo, 'outputPath' | 'outputDir'>,
  name: string,
): string {
  const requested = path.resolve(name);
  if (protectedPath(requested))
    throw new Error('Protected visual baseline destination.');
  const destination = path.isAbsolute(name) ? requested : info.outputPath(name);
  const root = resolvedPhysicalPath(path.resolve(info.outputDir));
  const resolved = resolvedPhysicalPath(path.resolve(destination));
  const relative = path.relative(root, resolved);
  if (protectedPath(resolved) || protectedPath(root)) {
    throw new Error('Protected visual baseline destination.');
  }
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      'Visual captures must remain inside the isolated test output.',
    );
  }
  return destination;
}

type ScreenshotOptions = Omit<
  NonNullable<Parameters<Page['screenshot']>[0]>,
  'path'
> & {
  path: string;
};

export async function captureScreenshot(
  info: TestInfo,
  target: Page | Locator,
  options: ScreenshotOptions,
): Promise<void> {
  const destination = visualCapturePath(info, options.path);
  if (!visualCapturesEnabled()) return;
  await target.screenshot({ ...options, path: destination });
}

export async function attachScreenshot(
  info: TestInfo,
  target: Page,
  name: string,
): Promise<void> {
  const destination = visualCapturePath(
    info,
    name.endsWith('.png') ? name : `${name}.png`,
  );
  if (!visualCapturesEnabled()) return;
  await target.screenshot({ fullPage: true, path: destination });
  await info.attach(name, { path: destination, contentType: 'image/png' });
}

export async function captureArtifact(
  info: TestInfo,
  name: string,
  produce: () => Promise<string | Buffer>,
): Promise<void> {
  const destination = visualCapturePath(info, name);
  if (!visualCapturesEnabled()) return;
  const content = await produce();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

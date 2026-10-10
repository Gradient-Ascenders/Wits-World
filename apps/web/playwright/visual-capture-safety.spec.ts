import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { captureScreenshot } from './visual-capture';

function protectedHashes(
  directory = path.resolve('.impeccable'),
): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filename = path.join(entry.parentPath, entry.name);
        return [
          filename,
          createHash('sha256').update(readFileSync(filename)).digest('hex'),
        ];
      }),
  );
}

const before = protectedHashes();
test.afterAll(() => {
  expect(protectedHashes()).toEqual(before);
});

test('functional assertions run without optional capture output', async ({
  page,
}, info) => {
  delete process.env.PLAYWRIGHT_VISUAL_CAPTURE;
  await page.setContent('<button>Open workspace</button>');
  await page.getByRole('button').focus();
  await captureScreenshot(info, page, { path: 'default.png' });
  await expect(page.getByRole('button')).toBeFocused();
  expect(existsSync(info.outputPath('default.png'))).toBe(false);
});

test('explicit captures use isolated Playwright output', async ({
  page,
}, info) => {
  process.env.PLAYWRIGHT_VISUAL_CAPTURE = '1';
  try {
    await page.setContent('<h1>Isolated capture</h1>');
    await captureScreenshot(info, page, { path: 'enabled.png' });
    expect(
      readFileSync(info.outputPath('enabled.png')).subarray(1, 4).toString(),
    ).toBe('PNG');
    await expect(page.getByRole('heading')).toBeVisible();
  } finally {
    delete process.env.PLAYWRIGHT_VISUAL_CAPTURE;
  }
});

test('protected paths are rejected before screenshot generation', async ({
  page,
}, info) => {
  await expect(
    captureScreenshot(info, page, {
      path: path.resolve('.impeccable/review/forbidden.png'),
    }),
  ).rejects.toThrow('Protected');
  expect(protectedHashes()).toEqual(before);
});

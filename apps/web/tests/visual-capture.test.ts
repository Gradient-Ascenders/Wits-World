import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import type { Page, TestInfo } from '@playwright/test';
import {
  attachScreenshot,
  captureArtifact,
  captureScreenshot,
  visualCapturePath,
} from '../playwright/visual-capture';

// Fail closed for unverified aliases: optional captures must supply a relative
// name (including relative joins) or explicitly use Playwright's outputPath.
function isolatedCaptureName(node: ts.Expression): boolean {
  if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
    const name = ts.isTemplateExpression(node)
      ? node.head.text +
        node.templateSpans.map((span) => 'value' + span.literal.text).join('')
      : node.text;
    return (
      !path.posix.isAbsolute(name) &&
      !path.win32.isAbsolute(name) &&
      !name
        .split(/[\\/]/)
        .some((part) =>
          ['..', '.impeccable', '.pr-screenshots'].includes(part.toLowerCase()),
        )
    );
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    if (node.expression.name.text === 'outputPath') return true;
    if (node.expression.getText() === 'path.join') {
      return (
        node.arguments.length > 0 && node.arguments.every(isolatedCaptureName)
      );
    }
  }
  return false;
}

function unsafeCaptureDestinations(file: ts.SourceFile): string[] {
  const unsafe: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const helper = node.expression.text;
      let destination: ts.Expression | undefined;
      if (helper === 'captureScreenshot') {
        const options = node.arguments[2];
        if (options && ts.isObjectLiteralExpression(options)) {
          const property = options.properties.find(
            (entry) =>
              ts.isPropertyAssignment(entry) &&
              entry.name.getText(file) === 'path',
          );
          if (property && ts.isPropertyAssignment(property))
            destination = property.initializer;
        }
      } else if (helper === 'captureArtifact') destination = node.arguments[1];
      else if (helper === 'attachScreenshot') destination = node.arguments[2];
      if (
        ['captureScreenshot', 'captureArtifact', 'attachScreenshot'].includes(
          helper,
        ) &&
        (!destination || !isolatedCaptureName(destination))
      ) {
        unsafe.push(destination?.getText(file) ?? node.getText(file));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return unsafe;
}

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith('visual-safety-')
    ) {
      throw new Error('Unexpected temporary fixture cleanup path.');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'visual-safety-'));
  directories.push(root);
  const outputDir = path.join(root, 'run', 'test');
  const info = {
    outputDir,
    outputPath: vi.fn((name: string) => path.resolve(outputDir, name)),
    attach: vi.fn(),
  } as unknown as TestInfo;
  const screenshot = vi.fn(async (options: { path: string }) => {
    await mkdir(path.dirname(options.path), { recursive: true });
    await writeFile(options.path, 'synthetic image');
    return Buffer.from('synthetic image');
  });
  const page = { screenshot } as unknown as Page;
  return { root, info, page, screenshot };
}

describe('optional visual capture isolation', () => {
  it('does not capture, create output or evaluate artifact producers by default', async () => {
    vi.stubEnv('PLAYWRIGHT_VISUAL_CAPTURE', '');
    const { info, page, screenshot } = await setup();
    const produce = vi.fn(async () => 'metrics');
    await captureScreenshot(info, page, { path: 'screen.png' });
    await attachScreenshot(info, page, 'attachment');
    await captureArtifact(info, 'metrics.json', produce);
    expect(screenshot).not.toHaveBeenCalled();
    expect(produce).not.toHaveBeenCalled();
    expect(info.attach).not.toHaveBeenCalled();
    expect(existsSync(info.outputDir)).toBe(false);
  });

  it('requires an exact opt-in and uses isolated output for images, attachments and metrics', async () => {
    const { info, page, screenshot } = await setup();
    vi.stubEnv('PLAYWRIGHT_VISUAL_CAPTURE', 'true');
    await captureScreenshot(info, page, { path: 'disabled.png' });
    expect(screenshot).not.toHaveBeenCalled();
    vi.stubEnv('PLAYWRIGHT_VISUAL_CAPTURE', '1');
    await captureScreenshot(info, page, {
      path: 'nested/screen.png',
      fullPage: true,
    });
    await attachScreenshot(info, page, 'attached.png');
    await captureArtifact(info, 'metrics.json', async () => '{"width":390}');
    expect(info.outputPath).toHaveBeenCalledWith('nested/screen.png');
    expect(await readFile(info.outputPath('nested/screen.png'), 'utf8')).toBe(
      'synthetic image',
    );
    expect(info.attach).toHaveBeenCalledWith('attached.png', {
      path: info.outputPath('attached.png'),
      contentType: 'image/png',
    });
    expect(await readFile(info.outputPath('metrics.json'), 'utf8')).toBe(
      '{"width":390}',
    );
  });

  it.each([
    '.impeccable/review/screen.png',
    '../.impeccable/screen.png',
    '..\\.IMPECCABLE\\screen.png',
  ])(
    'rejects protected relative destinations even with captures disabled: %s',
    async (name) => {
      const { info, page, screenshot } = await setup();
      await expect(
        captureScreenshot(info, page, { path: name }),
      ).rejects.toThrow('Protected visual baseline');
      expect(screenshot).not.toHaveBeenCalled();
    },
  );

  it('rejects protected absolute paths, unsafe output roots, traversal and outside paths', async () => {
    const { root, info } = await setup();
    expect(() =>
      visualCapturePath(info, path.join(root, '.impeccable', 'screen.png')),
    ).toThrow('Protected');
    expect(() => visualCapturePath(info, '../outside.png')).toThrow('isolated');
    expect(() =>
      visualCapturePath(info, path.join(root, 'outside.png')),
    ).toThrow('isolated');
    const unsafe = {
      ...info,
      outputDir: path.join(root, '.impeccable'),
      outputPath: (name: string) => path.join(root, '.impeccable', name),
    };
    expect(() => visualCapturePath(unsafe, 'screen.png')).toThrow('Protected');
  });

  it('rejects a symlink/junction into a protected directory without altering its sentinel', async () => {
    vi.stubEnv('PLAYWRIGHT_VISUAL_CAPTURE', '1');
    const { root, info, page } = await setup();
    const protectedDirectory = path.join(root, '.impeccable');
    await mkdir(protectedDirectory);
    const sentinel = path.join(protectedDirectory, 'screen.png');
    await writeFile(sentinel, 'original');
    const original = createHash('sha256')
      .update(await readFile(sentinel))
      .digest('hex');
    await mkdir(info.outputDir, { recursive: true });
    await symlink(
      protectedDirectory,
      path.join(info.outputDir, 'alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(
      captureScreenshot(info, page, { path: 'alias/screen.png' }),
    ).rejects.toThrow('Protected');
    expect(
      createHash('sha256')
        .update(await readFile(sentinel))
        .digest('hex'),
    ).toBe(original);
  });

  it('rejects the external PR screenshot destination even when captures are disabled', async () => {
    vi.stubEnv('PLAYWRIGHT_VISUAL_CAPTURE', '');
    const { info, page, screenshot } = await setup();
    await expect(
      captureScreenshot(info, page, {
        path: path.resolve(
          '../../.pr-screenshots/issue-76/desktop-card-depth.png',
        ),
      }),
    ).rejects.toThrow('isolated test output');
    expect(screenshot).not.toHaveBeenCalled();
  });

  it('detects external joins and indirect aliases in optional capture destinations', () => {
    const source = `
      const directory = path.resolve(process.cwd(), '../../.pr-screenshots/issue-76');
      const filename = path.join(directory, 'indirect.png');
      captureScreenshot(info, page, { path: path.join(directory, 'direct.png') });
      captureScreenshot(info, page, { path: filename });
      captureScreenshot(info, page, { path: path.join('..', '..', '.pr-screenshots', 'split.png') });
      captureArtifact(info, filename, produce);
      attachScreenshot(info, page, filename);
      captureScreenshot(info, page, { path: 'C:/external/screen.png' });
      captureScreenshot(info, page, { path: '/external/screen.png' });
      captureScreenshot(info, page, { path: path.resolve('screen.png') });
      captureScreenshot(info, page, { path: 'relative/screen.png' });
      captureScreenshot(info, page, { path: path.join('relative', 'screen.png') });
      captureScreenshot(info, page, { path: info.outputPath('screen.png') });
    `;
    const file = ts.createSourceFile(
      'fixture.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    expect(unsafeCaptureDestinations(file)).toEqual([
      "path.join(directory, 'direct.png')",
      'filename',
      "path.join('..', '..', '.pr-screenshots', 'split.png')",
      'filename',
      'filename',
      "'C:/external/screen.png'",
      "'/external/screen.png'",
      "path.resolve('screen.png')",
    ]);
  });

  it('keeps manual screenshots behind the shared helper and forbids protected test destinations', () => {
    const directory = path.resolve('playwright');
    for (const name of readdirSync(directory).filter(
      (name) => name.endsWith('.ts') && name !== 'visual-capture.ts',
    )) {
      const source = readFileSync(path.join(directory, name), 'utf8');
      if (name !== 'visual-capture-safety.spec.ts')
        expect(source, name).not.toContain('.impeccable');
      const file = ts.createSourceFile(
        name,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      if (name !== 'visual-capture-safety.spec.ts') {
        expect(unsafeCaptureDestinations(file), name).toEqual([]);
      }
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression)
        ) {
          expect(
            node.expression.name.text,
            `${name}: manual screenshot must use visual-capture`,
          ).not.toBe('screenshot');
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
  });
});

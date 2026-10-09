import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repositoryOnlyDocs } from '../docs-publication';
import sidebars from '../sidebars';

const docsRoot = fileURLToPath(new URL('../../../docs/', import.meta.url));

function collectDocIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectDocIds);
  if (!value || typeof value !== 'object') return [];
  const item = value as {
    type?: string;
    id?: string;
    items?: unknown;
    link?: unknown;
  };
  if (item.type === 'doc' && item.id) return [item.id];
  return [...collectDocIds(item.items), ...collectDocIds(item.link)];
}

const publishedFiles = readdirSync(docsRoot, {
  recursive: true,
  encoding: 'utf8',
})
  .filter((file) => /\.mdx?$/.test(file))
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => !repositoryOnlyDocs.includes(file))
  .sort();
const files = publishedFiles.map((file) => file.replace(/\.mdx?$/, ''));
const listed = Object.values(sidebars).flatMap(collectDocIds);

describe('documentation navigation coverage', () => {
  it('includes every published document in the sidebar', () => {
    expect(
      files.filter((id) => !listed.includes(id)),
      'Add these docs to a reader-focused section in apps/docs/sidebars.ts',
    ).toEqual([]);
  });
  it('contains no stale document references', () => {
    expect(listed.filter((id) => !files.includes(id))).toEqual([]);
  });
  it('lists each document only once', () => {
    expect(listed.filter((id, index) => listed.indexOf(id) !== index)).toEqual(
      [],
    );
  });

  it('keeps links in public pages away from repository-only source records', () => {
    const privateLinks: string[] = [];
    for (const file of publishedFiles) {
      const id = file.replace(/\.mdx?$/, '');
      const text = readFileSync(`${docsRoot}/${file}`, 'utf8');
      for (const match of text.matchAll(
        /\]\(([^()\s]+\.md(?:#[^()\s]*)?)\)/g,
      )) {
        const [target] = match[1].split('#');
        if (/^[a-z]+:|^\//i.test(target)) continue;
        const resolved = posix.normalize(posix.join(posix.dirname(id), target));
        if (repositoryOnlyDocs.includes(resolved))
          privateLinks.push(`${id}: ${target}`);
      }
    }
    expect(privateLinks).toEqual([]);
  });

  it('orders sprints chronologically with a consistent public structure', () => {
    const categories: { label: string; items: unknown[] }[] = [];
    function visit(value: unknown): void {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const item = value as {
        type?: string;
        label?: string;
        items?: unknown[];
      };
      if (item.type === 'category' && /^Sprint \d+$/.test(item.label ?? '')) {
        categories.push({ label: item.label!, items: item.items ?? [] });
      }
      visit(item.items);
    }
    Object.values(sidebars).forEach(visit);
    expect(categories.map(({ label }) => label)).toEqual([
      'Sprint 1',
      'Sprint 2',
      'Sprint 3',
      'Sprint 4',
    ]);
    categories.forEach(({ items }, index) => {
      const number = index + 1;
      const hasFeedback = number === 2 || number === 3;
      expect(collectDocIds(items)).toEqual([
        `planning/scrum/sprint-${number}/report`,
        `planning/scrum/sprint-${number}/evidence`,
        ...(hasFeedback ? [`planning/scrum/sprint-${number}/feedback`] : []),
      ]);
      expect(items.map((item) => (item as { label: string }).label)).toEqual([
        'Sprint report',
        'Evidence',
        ...(hasFeedback ? ['User feedback'] : []),
      ]);
    });
    expect(
      listed.filter((id) => /planning\/scrum\/sprint-\d\//.test(id)),
    ).toHaveLength(10);
  });
});

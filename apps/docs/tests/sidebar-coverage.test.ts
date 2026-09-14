import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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

const files = readdirSync(docsRoot, { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.mdx?$/.test(file))
  .map((file) => file.replaceAll('\\', '/').replace(/\.mdx?$/, ''))
  .sort();
const listed = Object.values(sidebars).flatMap(collectDocIds);

describe('documentation navigation coverage', () => {
  it('includes every document in the sidebar', () => {
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
});

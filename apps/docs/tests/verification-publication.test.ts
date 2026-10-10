import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repositoryOnlyDocs } from '../docs-publication';
import sidebars from '../sidebars';

const docsRoot = fileURLToPath(new URL('../../../docs/', import.meta.url));
const readDoc = (path: string) => readFileSync(`${docsRoot}${path}`, 'utf8');
const archivedEvidence = [
  'testing/basic-tier-release-validation.md',
  'testing/deployed-auth-cors-privacy-review.md',
  'testing/player-account-lifecycle-validation.md',
  'testing/api-battle-responsiveness.md',
  'requirements/location-eligibility-field-test.md',
];
const retiredGeneratedIndexes = new Map([
  ['/docs/product-requirements', '/docs/player-guide'],
  ['/docs/technical-reference', '/docs/developer-guide'],
  ['/docs/architecture', '/docs/architecture/overview'],
  ['/docs/data-database', '/docs/database/overview'],
  ['/docs/development-operations', '/docs/developer-guide'],
  ['/docs/testing-quality', '/docs/testing/testing-strategy'],
  ['/docs/project-management', '/docs/project'],
]);
const currentGeneratedIndexes = new Set([
  '/docs/player-guide',
  '/docs/developer-guide',
  '/docs/project',
]);

const readRedirects = () =>
  readFileSync(new URL('../static/_redirects', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/));

const headingAnchors = (markdown: string) =>
  [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) => {
    const explicit = heading.match(/\{\/\*\s*#([^\s]+)\s*\*\/\}$/)?.[1];
    if (explicit) return explicit;
    return heading
      .replace(/\s+\{\/\*.*$/, '')
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
  });

const expectPublishedDestination = (destination: string) => {
  const [route, anchor] = destination.split('#');
  if (currentGeneratedIndexes.has(route)) {
    expect(JSON.stringify(sidebars)).toContain(`"slug":"${route.slice(5)}"`);
    return;
  }

  const target = route.replace(/^\/docs\//, '');
  expect(repositoryOnlyDocs).not.toContain(`${target}.md`);
  const summary = readDoc(`${target}.md`);
  if (anchor) expect(headingAnchors(summary)).toContain(anchor);
};

describe('verification evidence publication', () => {
  it('redirects every retired public URL to a published replacement', () => {
    const redirects = readRedirects();
    const sources = redirects.map(([source]) => source);
    expect(new Set(sources).size).toBe(sources.length);
    expect(redirects).toHaveLength(
      (repositoryOnlyDocs.length + retiredGeneratedIndexes.size) * 2,
    );

    const expectRedirectPair = (route: string, expected?: string) => {
      const pair = [route, `${route}/`].map((source) => {
        const redirect = redirects.find(([candidate]) => candidate === source);
        expect(redirect, source).toBeDefined();
        expect(redirect![2]).toBe('301');
        return redirect![1];
      });
      expect(pair[0]).toBe(pair[1]);
      if (expected) expect(pair[0]).toBe(expected);
      expectPublishedDestination(pair[0]);
    };

    for (const path of repositoryOnlyDocs) {
      expectRedirectPair(`/docs/${path.replace(/\.md$/, '')}`);
    }
    for (const [route, destination] of retiredGeneratedIndexes) {
      expectRedirectPair(route, destination);
    }
  });

  it('keeps detailed records in Git without a public Verification group', () => {
    const navigation = JSON.stringify(sidebars);
    expect(navigation).not.toContain('"label":"Verification"');
    expect(navigation).not.toContain('"label":"Live checks"');
    for (const path of archivedEvidence) {
      expect(repositoryOnlyDocs).toContain(path);
      expect(readDoc(path)).toContain('\n# ');
      expect(navigation).not.toContain(path.replace(/\.md$/, ''));
    }
  });

  it('preserves dated authentication results and missing field evidence', () => {
    const sprint1 = readDoc('planning/scrum/sprint-1/evidence.md');
    expect(sprint1).toContain('## Authentication and privacy');
    expect(sprint1).toContain('22 August 2026, 21:06 SAST');
    expect(sprint1).toContain('`719cd4b`');
    expect(sprint1).toContain('The deployed SHA was not exposed.');
    expect(sprint1).toContain('## On-campus field evidence');
    expect(sprint1).toContain('**no recorded outcomes**');
    expect(sprint1).toContain('no campus pass is claimed.');
    expect(sprint1).toContain('/src/commit/');
    expect(sprint1).toContain(
      '/docs/testing/deployed-auth-cors-privacy-review.md',
    );
    expect(sprint1).toContain(
      '/docs/requirements/location-eligibility-field-test.md',
    );
  });

  it('keeps account fixture limits and measured battle evidence with source links', () => {
    const sprint2 = readDoc('planning/scrum/sprint-2/evidence.md');
    expect(sprint2).toContain('## Account lifecycle evidence');
    expect(sprint2).toContain('The record gives no execution date');
    expect(sprint2).toContain('Fixture coverage is not real Auth0');
    expect(sprint2).toContain('## Battle responsiveness');
    expect(sprint2).toContain('12 September 2026');
    expect(sprint2).toContain('**738 ms to 185 ms**');
    expect(sprint2).toContain('**83 queries to 3**');
    expect(sprint2).toContain('**64 queries to 3**');
    expect(sprint2).toContain('No signed-in deployed click-to-result');
    expect(sprint2).toContain(
      '/docs/testing/player-account-lifecycle-validation.md',
    );
    expect(sprint2).toContain('/docs/testing/api-battle-responsiveness.md');
    expect(readDoc('planning/scrum/sprint-2/feedback.md')).toContain(
      '(evidence.md#battle-responsiveness)',
    );
    expect(readDoc('planning/scrum/sprint-3/feedback.md')).toContain(
      '(../sprint-2/evidence.md#battle-responsiveness)',
    );
  });
});

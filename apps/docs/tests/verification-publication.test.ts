import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repositoryOnlyDocs } from '../docs-publication';
import sidebars from '../sidebars';

const docsRoot = fileURLToPath(new URL('../../../docs/', import.meta.url));
const readDoc = (path: string) => readFileSync(`${docsRoot}${path}`, 'utf8');
const archived = [
  'testing/basic-tier-release-validation.md',
  'testing/deployed-auth-cors-privacy-review.md',
  'testing/player-account-lifecycle-validation.md',
  'testing/api-battle-responsiveness.md',
  'requirements/location-eligibility-field-test.md',
];

describe('verification evidence publication', () => {
  it('redirects retired URLs to public summaries without losing source records', () => {
    const redirects = readFileSync(
      new URL('../static/_redirects', import.meta.url),
      'utf8',
    )
      .trim()
      .split('\n')
      .map((line) => line.split(/\s+/));
    expect(redirects).toHaveLength(archived.length * 2);
    for (const path of archived) {
      const route = `/docs/${path.replace(/\.md$/, '')}`;
      for (const from of [route, `${route}/`]) {
        const redirect = redirects.find(([source]) => source === from);
        expect(redirect, from).toBeDefined();
        const [, destination, status] = redirect!;
        expect(status).toBe('301');
        const [target, anchor] = destination
          .replace(/^\/docs\//, '')
          .split('#');
        expect(repositoryOnlyDocs).not.toContain(`${target}.md`);
        const summary = readDoc(`${target}.md`);
        if (anchor) {
          const headings = [...summary.matchAll(/^## (.+)$/gm)].map((match) =>
            match[1].toLowerCase().replaceAll(' ', '-'),
          );
          expect(headings).toContain(anchor);
        }
      }
    }
  });

  it('keeps detailed records in Git without a public Verification group', () => {
    const navigation = JSON.stringify(sidebars);
    expect(navigation).not.toContain('"label":"Verification"');
    expect(navigation).not.toContain('"label":"Live checks"');
    for (const path of archived) {
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

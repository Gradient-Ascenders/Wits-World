import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Screenshot = {
  file: string;
  width: number;
  height: number;
  sha256: string;
  questions: (number | string)[];
  questionText?: string | null;
  questionResponseCount?: number | null;
  comments?: string[];
};
type FocusedExcerpt = {
  file: string;
  source: string;
  finding: string;
  bounds: { x: number; y: number; width: number; height: number };
  commentIndices?: number[];
  quotes?: string[];
  question?: number;
  caption?: string;
};
const root = new URL('../static/img/feedback/sprint-3/', import.meta.url);
const source = JSON.parse(
  readFileSync(new URL('sources.json', root), 'utf8'),
) as {
  responseCount: number;
  csvSubmissionDate: string;
  screenshotCollectionDateRange: null;
  testedBuild: null;
  uniqueParticipantCount: null;
  images: Screenshot[];
  focusedExcerpts: FocusedExcerpt[];
};
const feedback = readFileSync(
  new URL('../../../docs/planning/scrum/sprint-3/feedback.md', import.meta.url),
  'utf8',
);
const evidence = readFileSync(
  new URL('../../../docs/planning/scrum/sprint-3/evidence.md', import.meta.url),
  'utf8',
);
const prose = feedback.replace(/\s+/g, ' ');

describe('Sprint 3 survey evidence', () => {
  it('preserves all eleven original screenshots and their provenance', () => {
    expect(source.images).toHaveLength(11);
    expect(new Set(source.images.map(({ file }) => file)).size).toBe(11);
    const questions = new Set(
      source.images.flatMap(({ questions }) => questions),
    );
    expect(questions.size).toBe(25);
    for (let question = 1; question <= 24; question++) {
      expect(questions.has(question)).toBe(true);
    }
    expect(questions.has('22a')).toBe(true);
    for (const image of source.images) {
      const bytes = readFileSync(new URL(image.file, root));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(image.width);
      expect(bytes.readUInt32BE(20)).toBe(image.height);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        image.sha256,
      );
    }
    expect(source.responseCount).toBe(15);
    expect(source.csvSubmissionDate).toBe('2026-09-28');
    expect(source.screenshotCollectionDateRange).toBeNull();
    expect(source.testedBuild).toBeNull();
    expect(source.uniqueParticipantCount).toBeNull();
    expect(prose).toContain('Three submissions contain identical answers');
    expect(prose).toContain('capture date and tested build are unknown');
  });

  it('retains every complete visible comment, including positive feedback', () => {
    const originals = feedback.split('## Full survey evidence')[1]!;
    const figures = originals.match(/<figure[\s\S]*?<\/figure>/g) ?? [];
    const written = source.images.filter(({ comments }) => comments);
    expect(written.map(({ comments }) => comments!.length)).toEqual([
      6, 6, 3, 8,
    ]);
    expect(
      written.map(({ questionResponseCount }) => questionResponseCount),
    ).toEqual([15, null, 5, 15]);
    for (const image of written) {
      const figure = figures.find((item) =>
        item.includes(`src="/img/feedback/sprint-3/${image.file}"`),
      );
      expect(figure).toBeDefined();
      const comments = [...figure!.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(
        ([, comment]) => comment!.replace(/\s+/g, ' ').trim(),
      );
      expect(comments).toEqual(image.comments);
      if (image.questionText) {
        expect(figure!.replace(/\s+/g, ' ')).toContain(image.questionText);
      }
    }
    expect(prose).toContain('all 23 complete visible comments');
    expect(prose).toContain(
      'must not be added together as unique participants',
    );
    expect(prose).toContain(
      'Question 22 appears in two images and is counted once',
    );
  });

  it('keeps bounded focused viewports pixel-faithful to their sources', () => {
    expect(source.focusedExcerpts).toHaveLength(6);
    for (const crop of source.focusedExcerpts) {
      const image = source.images.find(({ file }) => file === crop.source)!;
      const { x, y, width, height } = crop.bounds;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(x + width).toBeLessThanOrEqual(image.width);
      expect(y + height).toBeLessThanOrEqual(image.height);
      const svg = readFileSync(new URL(crop.file, root), 'utf8');
      expect(svg).toContain(`viewBox="${x} ${y} ${width} ${height}"`);
      const viewport = svg.match(/<svg[\s\S]*?>/)?.[0];
      expect(viewport).toContain(`width="${width}"`);
      expect(viewport).toContain(`height="${height}"`);
      expect(svg).toContain('<title');
      expect(svg).toContain('<desc');
      const embedded = svg.match(/href="data:image\/png;base64,([^"]+)"/);
      expect(embedded).not.toBeNull();
      expect(Buffer.from(embedded![1]!, 'base64')).toEqual(
        readFileSync(new URL(image.file, root)),
      );
      if (crop.commentIndices) {
        expect(crop.quotes).toEqual(
          crop.commentIndices.map((index) => image.comments![index]),
        );
      } else {
        expect(crop.question).toBe(14);
        expect(crop.caption).toContain('13 not tested/no disconnect');
      }
    }
  });

  it('places six accessible excerpts beside findings and all originals in one disclosure', () => {
    const main = feedback.split('## Full survey evidence')[0]!;
    const full = feedback.split('## Full survey evidence')[1]!;
    expect(feedback.match(/<details>/g)).toHaveLength(1);
    expect(main.match(/<figure/g)).toHaveLength(6);
    expect(full.match(/<figure/g)).toHaveLength(11);
    expect(main).not.toContain('## Collection method and limitations');
    expect(full).toContain('### Collection method and limitations');
    expect(main).toContain('[Run details](#verification-details)');
    expect(full).toContain('### Verification details');
    expect(full).toContain('### Discoverability');
    expect(full).toContain('### Feature understanding');
    expect(full).toContain('tests/live-session-boundaries.test.tsx');
    const display = [
      ...source.images,
      ...source.focusedExcerpts.map(({ file, bounds }) => ({
        file,
        width: bounds.width,
        height: bounds.height,
      })),
    ];
    const figures = feedback.match(/<figure[\s\S]*?<\/figure>/g) ?? [];
    for (const image of display) {
      const url = `/img/feedback/sprint-3/${image.file}`;
      const figure = figures.find((item) => item.includes(`src="${url}"`))!;
      expect(figure).toContain(`href="${url}"`);
      expect(figure).toMatch(/aria-label="[^"]+"/);
      expect(figure).toMatch(/alt="[^"]+"/);
      expect(figure).toContain(`width="${image.width}"`);
      expect(figure).toContain(`height="${image.height}"`);
      expect(figure).toContain('loading="lazy"');
      expect(figure).toMatch(/<figcaption>[\s\S]+?<\/figcaption>/);
    }
    for (const crop of source.focusedExcerpts) {
      const section = main
        .split(`### ${crop.finding}\n`)[1]!
        .split('\n### ')[0]!;
      expect(section).toContain(crop.file);
      expect(section).toContain('**Feedback:**');
      expect(section).toContain('**Changed:**');
      expect(section).toContain('**Proof:**');
      expect(section).toContain('**Still needed:**');
      expect(section).toMatch(/\/src\/commit\/[a-f0-9]{40}\//);
      expect(section).toMatch(/\/tests\/[^)\s]+\.test\.[^)\s]+#L\d+/);
    }
  });

  it('separates current implementation checks from historical and participant acceptance', () => {
    expect(feedback + evidence).not.toMatch(/UT-S3|ut-s3/);
    expect(prose).toContain('199 tests passed across 13 files');
    expect(prose).toContain('Implementation review: 10 October 2026');
    expect(prose).toContain('two recovery responses');
    expect(prose).toContain('Fourteen did not test either');
    expect(prose).toContain('The full application suite was not completed');
    expect(prose).toContain(
      'No browser, live database, hosted CI, deployed journey, or participant checks were run for this update',
    );
    expect(prose).toContain('Later PR #341 — 2 October');
    expect(prose).toContain(
      'creates no issues and records no participant retests',
    );
    expect(evidence).toContain('feedback.md#full-survey-evidence');
    expect(evidence).toContain('28 September feature and release snapshots');
  });
});

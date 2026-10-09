import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const imageRoot = new URL('../static/img/feedback/sprint-2/', import.meta.url);
type EvidenceImage = {
  file: string;
  width: number;
  height: number;
  sha256: string;
};
const source = JSON.parse(
  readFileSync(new URL('sources.json', imageRoot), 'utf8'),
) as {
  responseCount: number;
  originalCsvResponseCount: number;
  collectionDateRange: string | null;
  images: EvidenceImage[];
  writtenFeedback: {
    collectionDateRange: string | null;
    uniqueParticipantCount: number | null;
    images: (EvidenceImage & {
      questionText: string | null;
      questionResponseCount: number | null;
      comments: string[];
    })[];
  };
  focusedExcerpts: {
    file: string;
    source: string;
    commentIndex: number;
    finding: string;
    quote: string;
    questionIncluded: boolean;
    bounds: { x: number; y: number; width: number; height: number };
  }[];
};
const allImages = [...source.images, ...source.writtenFeedback.images];
const displayImages = [
  ...allImages,
  ...source.focusedExcerpts.map(({ file, bounds }) => ({
    file,
    width: bounds.width,
    height: bounds.height,
  })),
];
const feedback = readFileSync(
  fileURLToPath(
    new URL(
      '../../../docs/planning/scrum/sprint-2/feedback.md',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Sprint 2 questionnaire evidence', () => {
  it('retains all nine charts and eight written excerpts with their recorded dimensions', () => {
    expect(source.images).toHaveLength(9);
    expect(source.writtenFeedback.images).toHaveLength(8);
    expect(new Set(allImages.map(({ file }) => file)).size).toBe(17);
    for (const image of allImages) {
      const bytes = readFileSync(new URL(image.file, imageRoot));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        image.sha256,
      );
      expect(bytes.readUInt32BE(16)).toBe(image.width);
      expect(bytes.readUInt32BE(20)).toBe(image.height);
    }
  });

  it('provides accessible, full-size images and text captions for every screenshot', () => {
    const figures = feedback.match(/<figure[\s\S]*?<\/figure>/g) ?? [];
    expect(figures).toHaveLength(displayImages.length);
    expect(feedback.match(/<details>/g)).toHaveLength(1);
    for (const image of displayImages) {
      const url = `/img/feedback/sprint-2/${image.file}`;
      const figure = figures.find((item) => item.includes(`src="${url}"`));
      expect(figure).toBeDefined();
      expect(figure).toContain(`href="${url}"`);
      expect(figure).toMatch(/aria-label="[^"]+"/);
      expect(figure).toMatch(/alt="[^"]+"/);
      expect(figure).toContain(`width="${image.width}"`);
      expect(figure).toContain(`height="${image.height}"`);
      expect(figure).toContain('loading="lazy"');
      expect(figure).toMatch(/<figcaption>[\s\S]+?<\/figcaption>/);
    }
  });

  it('distinguishes the updated charts from the original CSV and unknown dates', () => {
    const prose = feedback.replace(/\s+/g, ' ');
    expect(source.responseCount).toBe(12);
    expect(source.originalCsvResponseCount).toBe(10);
    expect(source.collectionDateRange).toBeNull();
    expect(prose).toContain('12 responses per question');
    expect(prose).toContain('The earlier CSV snapshot contained ten responses');
    expect(prose).toContain(
      'The charts do not show when the additional responses were collected',
    );
    expect(prose).toContain('not evidence of two participant retests');
  });

  it('connects all five findings to pinned implementation and test evidence', () => {
    const section = feedback
      .split('## Prioritised findings')[1]!
      .split('## Traceability summary')[0]!;
    const findings = section.match(/### [^\n]+\n[\s\S]*?(?=\n### |$)/g) ?? [];
    expect(findings).toHaveLength(5);
    expect(feedback).not.toMatch(/UT-S2|ut-s2/);
    for (const finding of findings) {
      expect(finding).toContain('**Feedback:**');
      expect(finding).toContain('**Changed:**');
      expect(finding).toContain('**Proof:**');
      expect(finding).toMatch(/\/src\/commit\/[a-f0-9]{40}\//);
      expect(finding).toMatch(/\/tests\/[^)\s]+\.test\.[^)\s]+#L\d+/);
    }
    expect(feedback).not.toContain('| No linked change');
    expect(feedback).toContain('## Local implementation verification');
    expect(feedback.replace(/\s+/g, ' ')).toContain(
      'No browser, live database, hosted CI, deployed journey, or participant checks were run for this update.',
    );
  });

  it('transcribes every complete written comment without inventing participant counts', () => {
    const figures = feedback.match(/<figure[\s\S]*?<\/figure>/g) ?? [];
    expect(source.writtenFeedback.collectionDateRange).toBeNull();
    expect(source.writtenFeedback.uniqueParticipantCount).toBeNull();
    expect(
      source.writtenFeedback.images.map(({ comments }) => comments.length),
    ).toEqual([7, 5, 7, 7, 7, 8, 7, 8]);
    expect(
      source.writtenFeedback.images.map(
        ({ questionResponseCount }) => questionResponseCount,
      ),
    ).toEqual([null, null, 9, 8, 8, 11, 7, 12]);
    for (const image of source.writtenFeedback.images) {
      const figure = figures.find((item) =>
        item.includes(`src="/img/feedback/sprint-2/${image.file}"`),
      );
      expect(figure).toBeDefined();
      const comments = [...figure!.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(
        ([, comment]) => comment!.replace(/\s+/g, ' ').trim(),
      );
      expect(comments).toEqual(image.comments);
      if (image.questionResponseCount === null) {
        expect(image.questionText).toBeNull();
      } else {
        expect(image.comments.length).toBeLessThanOrEqual(
          image.questionResponseCount,
        );
        expect(figure!.replace(/\s+/g, ' ')).toContain(image.questionText);
        expect(figure).toContain(
          `${image.questionResponseCount} responses reported; ${image.comments.length} complete comments visible`,
        );
      }
    }
    const prose = feedback.replace(/\s+/g, ' ');
    expect(prose).toContain(
      'must not be added together as unique participants',
    );
    expect(prose).toContain('count remains 5/10');
    expect(prose).toContain(
      'These are reports of the problems, not proof of fixes',
    );
  });

  it('uses plain-language findings in the public sprint report and preserves uncovered requests', () => {
    const report = readFileSync(
      new URL(
        '../../../docs/planning/scrum/sprint-2/report.md',
        import.meta.url,
      ),
      'utf8',
    );
    expect(report).not.toMatch(/UT-S2|ut-s2/);
    expect(feedback).toContain('## Other requests needing review');
    expect(feedback).toContain('**Remaining gap:**');
    expect(feedback.replace(/\s+/g, ' ')).toContain(
      'mocked-map tests do not establish location accuracy',
    );
  });

  it('preserves unchanged screenshot bytes inside bounded focused crop viewports', () => {
    expect(source.focusedExcerpts).toHaveLength(5);
    for (const crop of source.focusedExcerpts) {
      const original = source.writtenFeedback.images.find(
        ({ file }) => file === crop.source,
      );
      expect(original).toBeDefined();
      expect(crop.quote).toBe(original!.comments[crop.commentIndex]);
      const { x, y, width, height } = crop.bounds;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(x + width).toBeLessThanOrEqual(original!.width);
      expect(y + height).toBeLessThanOrEqual(original!.height);

      const svg = readFileSync(new URL(crop.file, imageRoot), 'utf8');
      expect(svg).toContain(`viewBox="${x} ${y} ${width} ${height}"`);
      const viewport = svg.match(/<svg[\s\S]*?>/)?.[0];
      expect(viewport).toContain(`width="${width}"`);
      expect(viewport).toContain(`height="${height}"`);
      expect(svg).toContain('<title');
      expect(svg).toContain('<desc');
      const imageData = svg.match(/href="data:image\/png;base64,([^"]+)"/);
      expect(imageData).not.toBeNull();
      expect(Buffer.from(imageData![1]!, 'base64')).toEqual(
        readFileSync(new URL(crop.source, imageRoot)),
      );
    }
  });

  it('shows focused excerpts before changes and keeps all originals in one bottom disclosure', () => {
    const archiveStart = feedback.indexOf('## Full survey evidence');
    const attributionStart = feedback.indexOf('## AI declaration');
    expect(archiveStart).toBeGreaterThan(
      feedback.indexOf('## Follow-up evidence required'),
    );
    expect(attributionStart).toBeGreaterThan(archiveStart);
    const main = feedback.slice(0, archiveStart);
    const archive = feedback.slice(archiveStart, attributionStart);
    expect(main).not.toContain('<details>');
    expect(archive.match(/<details>/g)).toHaveLength(1);
    for (const image of allImages) {
      expect(archive).toContain(`src="/img/feedback/sprint-2/${image.file}"`);
      expect(main).not.toContain(`src="/img/feedback/sprint-2/${image.file}"`);
    }
    for (const crop of source.focusedExcerpts) {
      const finding = main.split(`### ${crop.finding}`)[1]!.split('\n### ')[0]!;
      const excerptAt = finding.indexOf(
        `src="/img/feedback/sprint-2/${crop.file}"`,
      );
      expect(excerptAt).toBeGreaterThan(finding.indexOf('**Feedback:**'));
      expect(excerptAt).toBeLessThan(finding.indexOf('**Changed:**'));
      expect(finding).toContain(crop.quote);
      expect(finding).toContain(`href="/img/feedback/sprint-2/${crop.source}"`);
    }
  });
});

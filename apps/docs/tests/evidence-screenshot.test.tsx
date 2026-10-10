import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import EvidenceScreenshot from '../src/components/EvidenceScreenshot';

describe('evidence screenshots', () => {
  it('frames a crop while preserving accessible access to the original image and caption', () => {
    const markup = renderToStaticMarkup(
      <EvidenceScreenshot
        src="/img/workflow/pr-28-review.png"
        alt="Pull request review and approval"
        crop={{ left: 120, top: 80, width: 900, height: 400 }}
      >
        Review evidence. <a href="/docs/project">Read the project context</a>.
      </EvidenceScreenshot>,
    );
    const original = '/preview/img/workflow/pr-28-review.png';

    expect(markup).toContain('<figure class="workflow-evidence">');
    expect(markup).toContain(
      `<a href="${original}" aria-label="Open full-size screenshot: Pull request review and approval">`,
    );
    expect(markup).toContain(
      '<svg role="img" aria-label="Pull request review and approval" width="900" height="400" viewBox="120 80 900 400">',
    );
    expect(markup).toContain(
      `<image href="${original}" width="1920" height="1080">`,
    );
    expect(markup).toContain(
      '<figcaption>Review evidence. <a href="/docs/project">Read the project context</a>.</figcaption>',
    );
  });
});

import type { ReactNode } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

type EvidenceScreenshotProps = {
  src: string;
  alt: string;
  crop: { left: number; top: number; width: number; height: number };
  children: ReactNode;
};

/** Frame the relevant part of a screenshot without changing the original asset. */
export default function EvidenceScreenshot({
  src,
  alt,
  crop,
  children,
}: EvidenceScreenshotProps): ReactNode {
  const original = useBaseUrl(src);

  return (
    <figure className="workflow-evidence">
      <a href={original} aria-label={`Open full-size screenshot: ${alt}`}>
        <svg
          role="img"
          aria-label={alt}
          width={crop.width}
          height={crop.height}
          viewBox={`${crop.left} ${crop.top} ${crop.width} ${crop.height}`}
        >
          <image href={original} width="1920" height="1080" />
        </svg>
      </a>
      <figcaption>{children}</figcaption>
    </figure>
  );
}

import { memo } from 'react';
import sealMarkup from '../../assets/branding/wits-world-campus-seal-loader.svg?raw';

const sealMarkupHtml = { __html: sealMarkup };

export const StartupSeal = memo(function StartupSeal({ animate }: { animate: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="startup-seal"
      data-animate={animate}
      dangerouslySetInnerHTML={sealMarkupHtml}
    />
  );
});

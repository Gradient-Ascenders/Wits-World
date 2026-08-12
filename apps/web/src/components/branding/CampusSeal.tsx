import campusSealUrl from '../../assets/branding/wits-world-campus-seal-transparent.svg';

interface CampusSealProps {
  alt?: string;
  className?: string;
  decorative?: boolean;
}

export function CampusSeal({
  alt = 'Wits World Campus Seal',
  className,
  decorative = false,
}: CampusSealProps) {
  const classes = ['campus-seal', className].filter(Boolean).join(' ');

  return (
    <img
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? true : undefined}
      className={classes}
      height="347"
      src={campusSealUrl}
      width="321"
    />
  );
}

import type { AnchorHTMLAttributes, ReactNode } from 'react';

interface LinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> {
  children: ReactNode;
  to: string;
}

export default function Link({ to, children, ...props }: LinkProps) {
  return (
    <a href={to} {...props}>
      {children}
    </a>
  );
}

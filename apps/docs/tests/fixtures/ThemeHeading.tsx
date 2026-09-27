import { createElement, type HTMLAttributes, type ReactNode } from 'react';

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  children: ReactNode;
}

export default function Heading({ as, children, ...props }: HeadingProps) {
  return createElement(as, props, children);
}

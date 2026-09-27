import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

export default function Layout({ children, title, description }: LayoutProps) {
  return (
    <div data-description={description} data-title={title}>
      {children}
    </div>
  );
}

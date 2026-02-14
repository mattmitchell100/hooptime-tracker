import React from 'react';

type PageLayoutProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export const PAGE_PADDING_X = 'px-[var(--page-pad-x)]';
export const PAGE_PADDING_Y = 'py-[var(--page-pad-y)]';
const PAGE_CONTAINER = `max-w-4xl mx-auto ${PAGE_PADDING_X} ${PAGE_PADDING_Y}`;

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  className = '',
  contentClassName = ''
}) => (
  <div className={`min-h-screen ${className}`}>
    <div className={`${PAGE_CONTAINER} ${contentClassName}`}>
      {children}
    </div>
  </div>
);

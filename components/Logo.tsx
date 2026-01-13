import React from 'react';

type LogoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  alt?: string;
  hideOnError?: boolean;
};

export const Logo: React.FC<LogoProps> = ({
  className = 'h-[60px]',
  alt = 'ptTRACKr',
  hideOnError = true,
  onError,
  ...rest
}) => {
  const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (hideOnError) {
      event.currentTarget.style.display = 'none';
    }
    if (onError) {
      onError(event);
    }
  };

  return (
    <img
      src="/pttrackr-logo.svg"
      alt={alt}
      className={className}
      onError={handleError}
      {...rest}
    />
  );
};

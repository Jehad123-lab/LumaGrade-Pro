import React from 'react';
import { IconProps } from '@phosphor-icons/react';

interface Props extends IconProps {
  component: React.ComponentType<IconProps>;
  size?: number | string;
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}

export const Icon: React.FC<Props> = ({ component: Component, size = 20, className = '', ...props }) => {
  return <Component size={size} className={`transition-colors duration-200 ${className}`} {...props} />;
};
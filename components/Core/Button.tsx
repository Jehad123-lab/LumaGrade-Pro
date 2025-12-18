import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  active = false,
  ...props 
}) => {
  const baseStyles = "relative inline-flex items-center justify-center font-medium rounded-md transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const sizeStyles = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  const variantStyles = {
    primary: "bg-zinc-100 text-zinc-900 hover:bg-white shadow-[0_0_15px_rgba(255,255,255,0.1)]",
    secondary: "bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600",
    ghost: `text-zinc-400 hover:text-white hover:bg-white/5 ${active ? 'text-white bg-white/10' : ''}`,
    icon: `p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 ${active ? 'text-green-400 bg-green-400/10' : ''}`,
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`${baseStyles} ${variant !== 'icon' ? sizeStyles[size] : ''} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
};
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'top', className = '', delay = 400 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | undefined>(undefined);

  const handleMouseEnter = () => {
    timeoutRef.current = window.setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        let x = 0;
        let y = 0;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        if (side === 'top') {
            x = centerX;
            y = rect.top - 8;
        } else if (side === 'bottom') {
            x = centerX;
            y = rect.bottom + 8;
        } else if (side === 'left') {
            x = rect.left - 8;
            y = centerY;
        } else if (side === 'right') {
            x = rect.right + 8;
            y = centerY;
        }

        setCoords({ x, y });
        setIsVisible(true);
      }
    }, delay); 
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };
  
  useEffect(() => {
      return () => clearTimeout(timeoutRef.current);
  }, []);

  const variants = {
      initial: { 
          opacity: 0, 
          scale: 0.9, 
          x: side === 'left' ? '0%' : side === 'right' ? '0%' : '-50%', 
          y: side === 'top' ? 4 : side === 'bottom' ? -4 : '-50%' 
      },
      animate: { 
          opacity: 1, 
          scale: 1, 
          x: side === 'left' ? '-100%' : side === 'right' ? '0%' : '-50%', 
          y: side === 'top' ? '-100%' : side === 'bottom' ? '0%' : '-50%' 
      },
      exit: { opacity: 0, scale: 0.9 }
  };

  return (
    <>
      <div 
        ref={triggerRef} 
        onMouseEnter={handleMouseEnter} 
        onMouseLeave={handleMouseLeave}
        className={`${className}`}
      >
        {children}
      </div>
      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={variants.initial}
              animate={variants.animate}
              exit={variants.exit}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{ 
                  position: 'fixed', 
                  top: coords.y, 
                  left: coords.x, 
                  zIndex: 10000,
                  pointerEvents: 'none'
              }}
              className="bg-zinc-800 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 text-[10px] px-2.5 py-1.5 rounded-md shadow-xl border border-white/5 dark:border-black/5 font-medium whitespace-nowrap z-[9999]"
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
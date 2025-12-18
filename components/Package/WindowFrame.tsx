
import React, { useRef, useState, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { Icon } from '../Core/Icon';

interface WindowFrameProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onFocus: () => void;
  zIndex: number;
  width?: number | string;
  height?: number | string;
  className?: string;
  initialPos?: { x: number; y: number };
  children: React.ReactNode;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({ 
  title, 
  isOpen, 
  onClose, 
  onFocus, 
  zIndex, 
  width: initialWidth = 300, 
  height: initialHeight = 'auto',
  className = '',
  initialPos,
  children 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  
  // Dimensions state for resizing
  const [size, setSize] = useState({ 
    width: typeof initialWidth === 'number' ? initialWidth : 300, 
    height: typeof initialHeight === 'number' ? initialHeight : 400 
  });

  // Center if no initial pos provided
  const defaultPos = initialPos || { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 200 };

  // Handle Resize
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = typeof size.height === 'number' ? size.height : containerRef.current?.offsetHeight || 400;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const newWidth = Math.max(200, startWidth + (moveEvent.clientX - startX));
      const newHeight = Math.max(150, startHeight + (moveEvent.clientY - startY));
      setSize({ width: newWidth, height: newHeight });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false} 
      dragMomentum={false}
      initial={{ 
        opacity: 0, 
        scale: 0.95, 
        x: defaultPos.x, 
        y: defaultPos.y 
      }}
      animate={{ 
        opacity: isOpen ? 1 : 0, 
        scale: isOpen ? 1 : 0.95,
        display: isOpen ? 'flex' : 'none',
        width: size.width,
        height: size.height
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ zIndex }}
      className={`absolute flex-col bg-white/95 dark:bg-[#18181b]/90 backdrop-blur-3xl border border-zinc-200 dark:border-white/10 rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.2)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden ring-1 ring-black/5 dark:ring-white/5 ${className}`}
      onMouseDown={onFocus}
      onTouchStart={onFocus}
      ref={containerRef}
    >
      {/* Header */}
      <motion.div 
        className="h-10 shrink-0 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none border-b border-black/5 dark:border-white/5 touch-none bg-zinc-50/50 dark:bg-white/5"
        onPointerDown={(e) => dragControls.start(e)}
      >
        <h3 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 tracking-[0.2em] uppercase font-['Inter'] truncate pr-4">
            {title}
        </h3>
        <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="group relative flex items-center justify-center w-5 h-5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
        >
            <Icon 
              component={X} 
              size={12} 
              className="text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" 
              weight="bold"
            />
        </button>
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative bg-zinc-50/50 dark:bg-black/20">
        {children}
      </div>

      {/* Resize Handle */}
      <div 
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center z-50 touch-none group"
        onPointerDown={handleResizePointerDown}
      >
         <div className="w-1.5 h-1.5 border-r border-b border-zinc-300 dark:border-zinc-600 group-hover:border-zinc-500 dark:group-hover:border-zinc-400" />
      </div>
    </motion.div>
  );
};

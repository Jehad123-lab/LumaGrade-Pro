
import React, { useRef, useState, useEffect } from 'react';
import { Tooltip } from './Tooltip';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  resetValue?: number;
  tooltip?: string;
  trackGradient?: string;
  centered?: boolean; 
}

export const Slider: React.FC<SliderProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  step = 0.01, 
  onChange, 
  onCommit, 
  resetValue = 0, 
  tooltip,
  trackGradient,
  centered = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  
  // Calculate fill for centered sliders (bi-directional)
  let fillLeft = '0%';
  let fillWidth = `${percentage}%`;

  if (centered) {
      const centerPercent = ((resetValue - min) / (max - min)) * 100;
      if (value >= resetValue) {
          fillLeft = `${centerPercent}%`;
          fillWidth = `${percentage - centerPercent}%`;
      } else {
          fillLeft = `${percentage}%`;
          fillWidth = `${centerPercent - percentage}%`;
      }
  }

  const content = (
    <div 
        className="flex flex-col gap-1.5 mb-3 group select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex justify-between items-baseline">
        <label className={`text-[10px] font-bold uppercase tracking-widest font-['Inter'] transition-colors duration-200 ${isHovered || isDragging ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-500'}`}>
            {label}
        </label>
        <div className="flex items-center gap-2">
            {value !== resetValue && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onChange(resetValue); onCommit?.(resetValue); }}
                    className="text-[9px] uppercase tracking-wider text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-300 transition-colors animate-in fade-in duration-200"
                >
                    Reset
                </button>
            )}
            <span className={`text-[10px] font-mono tabular-nums min-w-[32px] text-right transition-colors duration-200 ${isDragging ? 'text-blue-500 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {value.toFixed(step < 0.1 ? 2 : 1)}
            </span>
        </div>
      </div>
      
      <div className="relative w-full h-4 flex items-center cursor-ew-resize touch-none">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerDown={() => setIsDragging(true)}
          onPointerUp={() => { setIsDragging(false); onCommit?.(value); }}
          onKeyUp={() => onCommit?.(value)}
          className="absolute w-full h-full opacity-0 cursor-ew-resize z-20"
        />
        
        {/* Track Container */}
        <div className="w-full h-[2px] bg-zinc-200 dark:bg-zinc-800 rounded-full relative overflow-visible">
            {/* Center Detent Marker */}
            {centered && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full z-0" />
            )}

            {/* Fill Track */}
            {!trackGradient && (
                <div 
                    className={`absolute top-0 bottom-0 rounded-full transition-colors duration-200 ${isDragging ? 'bg-blue-500 dark:bg-blue-400' : 'bg-zinc-600 dark:bg-zinc-400'}`}
                    style={{ left: fillLeft, width: fillWidth }}
                />
            )}
            
            {/* Gradient Track (if active) */}
            {trackGradient && (
                <div 
                    className="absolute inset-0 rounded-full"
                    style={{ background: trackGradient }}
                />
            )}
            
            {/* Thumb */}
            <div 
                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-[#e4e4e7] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-zinc-200 dark:border-none z-10 pointer-events-none transition-transform duration-150 ease-out origin-center ${isDragging || isHovered ? 'scale-100' : 'scale-0'}`}
                style={{ left: `calc(${percentage}% - 6px)` }}
            >
                {/* Active Ring */}
                 {isDragging && (
                    <div className="absolute -inset-1 rounded-full border border-blue-500/50 dark:border-blue-400/50 animate-pulse" />
                 )}
            </div>
        </div>
      </div>
    </div>
  );

  if (tooltip) {
      return <Tooltip content={tooltip} className="w-full block" side="left">{content}</Tooltip>;
  }

  return content;
};

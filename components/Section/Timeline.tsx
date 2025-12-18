
import React, { useState, useEffect } from 'react';
import { Play, Pause, Rewind, FastForward, SkipBack, SkipForward } from '@phosphor-icons/react';
import { Icon } from '../Core/Icon';
import { Tooltip } from '../Core/Tooltip';

interface TimelineProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, isPlaying, onPlayPause, onSeek }) => {
  const [localTime, setLocalTime] = useState(currentTime);
  const [isDragging, setIsDragging] = useState(false);

  // Sync with external time unless dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalTime(currentTime);
    }
  }, [currentTime, isDragging]);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return (
      <div className="flex gap-0.5 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
        <span>{mins.toString().padStart(2, '0')}</span>
        <span className="text-zinc-400 dark:text-zinc-600">:</span>
        <span>{secs.toString().padStart(2, '0')}</span>
        <span className="text-zinc-400 dark:text-zinc-600">:</span>
        <span className="text-zinc-400 dark:text-zinc-500">{ms.toString().padStart(2, '0')}</span>
      </div>
    );
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setLocalTime(t);
    onSeek(t);
  };

  return (
    <div className="px-6 py-4 flex flex-col justify-between h-full bg-zinc-50 dark:bg-[#09090b]">
      
      {/* Top Bar: Timecode */}
      <div className="flex justify-between items-center mb-2">
         {formatTime(localTime)}
         <div className="h-px flex-1 mx-4 bg-zinc-200 dark:bg-zinc-800/50" />
         {formatTime(duration)}
      </div>

      {/* Scrubber Area */}
      <Tooltip content="Drag to seek" className="relative h-8 w-full block">
        <div className="relative h-8 w-full flex items-center group touch-none">
            {/* Ruler Ticks (Visual) */}
            <div className="absolute top-0 w-full h-full flex justify-between items-end opacity-20 pointer-events-none px-0.5">
            {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className={`w-px bg-zinc-400 dark:bg-zinc-500 ${i % 5 === 0 ? 'h-3' : 'h-1.5'}`} />
            ))}
            </div>

            <input 
                type="range"
                min={0}
                max={duration || 100} 
                step={0.01}
                value={localTime}
                onChange={handleScrub}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onTouchStart={() => setIsDragging(true)}
                onTouchEnd={() => setIsDragging(false)}
                className="absolute w-full h-full opacity-0 z-20 cursor-pointer"
            />
            
            {/* Track */}
            <div className="absolute w-full h-[2px] bg-zinc-300 dark:bg-zinc-800 rounded-full overflow-hidden top-1/2 -translate-y-1/2">
                <div 
                    className="h-full bg-zinc-600 dark:bg-zinc-400 transition-all duration-75 ease-linear"
                    style={{ width: `${(localTime / (duration || 1)) * 100}%` }}
                />
            </div>
            
            {/* Playhead */}
            <div 
                className="absolute h-8 w-px bg-zinc-900 dark:bg-white z-10 pointer-events-none top-0 transition-all duration-75 ease-linear shadow-[0_0_10px_rgba(0,0,0,0.2)] dark:shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                style={{ left: `${(localTime / (duration || 1)) * 100}%` }}
            >
                <div className="absolute -top-1 -left-[3.5px] w-[8px] h-[8px] rotate-45 bg-zinc-900 dark:bg-white rounded-[1px]" />
            </div>
        </div>
      </Tooltip>

      {/* Controls */}
      <div className="flex justify-center items-center gap-6 mt-2">
        <Tooltip content="Go to start">
            <button 
                onClick={() => onSeek(0)}
                className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
                <Icon component={SkipBack} weight="fill" size={14} />
            </button>
        </Tooltip>
        
        <Tooltip content="Rewind 5s">
            <button 
                onClick={() => onSeek(Math.max(0, localTime - 5))}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
            >
                <Icon component={Rewind} weight="fill" size={18} />
            </button>
        </Tooltip>
        
        <Tooltip content={isPlaying ? "Pause" : "Play"}>
            <button 
                onClick={onPlayPause}
                className="flex items-center justify-center w-10 h-10 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-black/10 dark:shadow-white/10"
            >
                <Icon component={isPlaying ? Pause : Play} weight="fill" size={18} />
            </button>
        </Tooltip>

        <Tooltip content="Forward 5s">
            <button 
                onClick={() => onSeek(Math.min(duration, localTime + 5))}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
            >
                <Icon component={FastForward} weight="fill" size={18} />
            </button>
        </Tooltip>

        <Tooltip content="Go to end">
            <button 
                onClick={() => onSeek(duration)}
                className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
                <Icon component={SkipForward} weight="fill" size={14} />
            </button>
        </Tooltip>
      </div>
    </div>
  );
};

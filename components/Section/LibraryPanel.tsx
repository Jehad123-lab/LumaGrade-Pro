
import React from 'react';
import { Icon } from '../Core/Icon';
import { MagnifyingGlass, ImageSquare, FilmStrip, Plus } from '@phosphor-icons/react';
import { MediaState, GradingParams } from '../../types';
import { WaveformMonitor } from './WaveformMonitor';

interface LibraryPanelProps {
    sessionMedia: MediaState[];
    currentMediaId: string | null;
    onSelectMedia: (media: MediaState) => void;
    onImportClick: () => void;
    grading: GradingParams;
    media: MediaState;
    isPlaying: boolean;
}

interface LibraryItemProps {
  icon: any;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const LibraryItem: React.FC<LibraryItemProps> = ({ icon, label, active, onClick }) => (
    <div 
        onClick={onClick}
        className={`
            group flex items-center gap-3 py-2 px-3 mb-1 rounded-md cursor-pointer transition-all duration-200 select-none border border-transparent
            ${active 
                ? 'bg-zinc-800 text-white border-white/10' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'} 
        `}
    >
        <Icon 
            component={icon} 
            size={16} 
            weight={active ? 'fill' : 'regular'} 
            className={active ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400'} 
        />
        <span className="text-[12px] font-medium truncate leading-none pt-0.5">{label}</span>
    </div>
);

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ 
    sessionMedia, currentMediaId, onSelectMedia, onImportClick,
    grading, media, isPlaying
}) => {
  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] font-sans">
        
        {/* Waveform Monitor Area */}
        <div className="shrink-0 bg-black border-b border-white/5">
            <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Scopes</span>
            </div>
            <WaveformMonitor grading={grading} media={media} isPlaying={isPlaying} className="w-full h-40 bg-black" />
        </div>

        {/* Media List */}
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-white/5">
                <div className="relative group">
                    <Icon component={MagnifyingGlass} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Search media..." 
                        className="w-full bg-[#121214] border border-white/5 rounded-md py-1.5 pl-9 pr-3 text-[11px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 focus:bg-[#18181b] transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Imported</span>
                    <span className="text-[9px] text-zinc-700 font-mono bg-white/5 px-1.5 rounded">{sessionMedia.length}</span>
                </div>

                {sessionMedia.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-white/5 rounded-lg mt-2">
                        <p className="text-[10px] text-zinc-600 mb-3">No media loaded</p>
                        <button 
                            onClick={onImportClick}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold transition-colors"
                        >
                            Import File
                        </button>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {sessionMedia.map(item => (
                            <LibraryItem 
                                key={item.id}
                                icon={item.type === 'video' ? FilmStrip : ImageSquare} 
                                label={item.name || 'Untitled'} 
                                active={item.id === currentMediaId}
                                onClick={() => onSelectMedia(item)}
                            />
                        ))}
                    </div>
                )}
            </div>
            
            {sessionMedia.length > 0 && (
                <div className="p-3 border-t border-white/5">
                    <button 
                        onClick={onImportClick}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/5 hover:border-white/10 rounded transition-all"
                    >
                        <Icon component={Plus} size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Import New</span>
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};

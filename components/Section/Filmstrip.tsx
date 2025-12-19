
import React from 'react';
import { MediaState } from '../../types';
import { Icon } from '../Core/Icon';
import { FilmStrip, ImageSquare, Plus } from '@phosphor-icons/react';

interface FilmstripProps {
    media: MediaState[];
    activeId: string | null;
    onSelect: (media: MediaState) => void;
    onAdd: () => void;
}

export const Filmstrip: React.FC<FilmstripProps> = ({ media, activeId, onSelect, onAdd }) => {
  return (
    <div className="h-full w-full bg-[#0c0c0e] flex items-center">
        <div className="flex-1 h-full overflow-x-auto custom-scrollbar flex items-center px-4 gap-3">
            
            {media.map((item) => {
                const isActive = item.id === activeId;
                return (
                    <button
                        key={item.id}
                        onClick={() => onSelect(item)}
                        className={`
                            group relative h-[70px] aspect-video shrink-0 rounded-md overflow-hidden transition-all duration-200
                            ${isActive 
                                ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#0c0c0e]' 
                                : 'opacity-70 hover:opacity-100 ring-1 ring-white/10 hover:ring-white/30'}
                        `}
                    >
                        {item.thumbnail || item.url ? (
                            <img src={item.thumbnail || item.url || ''} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                <Icon component={item.type === 'video' ? FilmStrip : ImageSquare} size={20} className="text-zinc-700" />
                            </div>
                        )}
                        
                        {/* Type Icon */}
                        <div className="absolute bottom-1 right-1">
                            <Icon 
                                component={item.type === 'video' ? FilmStrip : ImageSquare} 
                                size={12} 
                                weight="fill"
                                className="text-white drop-shadow-md opacity-80" 
                            />
                        </div>
                    </button>
                );
            })}

            {/* Add Button */}
            <button 
                onClick={onAdd}
                className="h-[70px] w-[50px] shrink-0 rounded-md border border-dashed border-zinc-700 hover:border-zinc-500 hover:bg-white/5 flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-all"
                title="Import Media"
            >
                <Icon component={Plus} size={18} />
            </button>
        </div>
    </div>
  );
};

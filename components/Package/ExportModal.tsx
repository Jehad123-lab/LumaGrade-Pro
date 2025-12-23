
import React from 'react';
import { WindowFrame } from './WindowFrame';
import { Icon } from '../Core/Icon';
import { ImageSquare, FilmStrip, DownloadSimple, X } from '@phosphor-icons/react';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (type: 'image' | 'video') => void;
    mediaType: 'image' | 'video' | null;
    isExporting: boolean;
    progress: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({ 
    isOpen, onClose, onExport, mediaType, isExporting, progress 
}) => {
    return (
        <WindowFrame
            title="Export Media"
            isOpen={isOpen}
            onClose={onClose}
            onFocus={() => {}}
            zIndex={200}
            width={340}
            height="auto"
            initialPos={{ x: window.innerWidth / 2 - 170, y: window.innerHeight / 2 - 150 }}
        >
            <div className="p-6">
                {!isExporting ? (
                    <div className="space-y-6">
                        <div className="text-center space-y-2">
                            <h3 className="text-lg font-bold text-zinc-100">Select Export Format</h3>
                            <p className="text-xs text-zinc-500">Choose how you want to export your graded media.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {/* Image Export */}
                            <button
                                onClick={() => onExport('image')}
                                className="group flex items-center p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 hover:border-zinc-500 transition-all text-left"
                            >
                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:text-blue-400 group-hover:scale-110 transition-all">
                                    <Icon component={ImageSquare} size={24} weight="fill" />
                                </div>
                                <div className="ml-3">
                                    <span className="block text-sm font-bold text-zinc-200">Current Frame (PNG)</span>
                                    <span className="block text-[10px] text-zinc-500">Export high-quality snapshot</span>
                                </div>
                            </button>

                            {/* Video Export */}
                            {mediaType === 'video' && (
                                <button
                                    onClick={() => onExport('video')}
                                    className="group flex items-center p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 hover:border-zinc-500 transition-all text-left"
                                >
                                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 group-hover:text-purple-400 group-hover:scale-110 transition-all">
                                        <Icon component={FilmStrip} size={24} weight="fill" />
                                    </div>
                                    <div className="ml-3">
                                        <span className="block text-sm font-bold text-zinc-200">Render Video (WebM)</span>
                                        <span className="block text-[10px] text-zinc-500">Export graded video with audio</span>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="py-8 flex flex-col items-center justify-center space-y-4">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="animate-spin w-full h-full text-zinc-700" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75 text-blue-500" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="absolute text-[10px] font-mono text-white font-bold">{Math.round(progress * 100)}%</span>
                        </div>
                        <div className="text-center">
                            <h4 className="text-sm font-bold text-zinc-200">Rendering...</h4>
                            <p className="text-[10px] text-zinc-500 mt-1">Please wait while we process your video.</p>
                        </div>
                    </div>
                )}
            </div>
        </WindowFrame>
    );
};

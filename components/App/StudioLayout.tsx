
import React, { useState } from 'react';
import { ControlPanel } from '../Section/ControlPanel';
import { WebGLCanvas } from '../Section/WebGLCanvas';
import { Timeline } from '../Section/Timeline';
import { LibraryPanel } from '../Section/LibraryPanel';
import { GradingParams, MediaState, Preset, ToolType, SamplerPoint, PointColorData } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../Core/Icon';
import { 
    CornersOut, SidebarSimple, SquaresFour, Hand,
    List, Waveform, Images, Eyedropper
} from '@phosphor-icons/react';
import { Tooltip } from '../Core/Tooltip';

interface StudioLayoutProps {
    grading: GradingParams;
    media: MediaState;
    sessionMedia: MediaState[];
    isPlaying: boolean;
    seekSignal: number | null;
    onUpdateGrading: (key: keyof GradingParams, val: any, commit?: boolean) => void;
    onCommitGrading: () => void;
    onMediaLoaded: (data: Partial<MediaState>) => void;
    onPlayPause: () => void;
    onSeek: (t: number) => void;
    onSelectMedia: (m: MediaState) => void;
    onImportClick: () => void;
    presets: Preset[];
    onSavePreset: (name: string) => void;
    onLoadPreset: (preset: Preset) => void;
    onDeletePreset: (id: string) => void;
    
    // Tool Props
    activeTool: ToolType;
    onToolChange: (t: ToolType) => void;
}

type LeftSidebarMode = 'library' | 'scopes' | null;

export const StudioLayout: React.FC<StudioLayoutProps> = (props) => {
    const [leftMode, setLeftMode] = useState<LeftSidebarMode>('library');
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
    const [fitSignal, setFitSignal] = useState(0);

    const toggleRight = () => setRightPanelOpen(!rightPanelOpen);
    const toggleBottom = () => setBottomPanelOpen(!bottomPanelOpen);
    const triggerFit = () => setFitSignal(s => s + 1);

    const handleLeftRailClick = (mode: LeftSidebarMode) => {
        if (leftMode === mode) {
            setLeftMode(null); // Collapse
        } else {
            setLeftMode(mode);
        }
    };
    
    // Handler for Point Color sampling (Adds a new point)
    const handleSamplePointColor = (h: number, s: number, l: number) => {
        const currentPoints = props.grading.pointColor.points || [];
        
        // Limit to 8 points
        if (currentPoints.length >= 8) {
            alert("Maximum 8 color points reached. Delete one to add new.");
            return;
        }

        const newPoint: PointColorData = {
            id: Date.now().toString(),
            active: true,
            srcHue: h,
            srcSat: s,
            srcLum: l,
            hueShift: 0,
            satShift: 0,
            lumShift: 0,
            hueRange: 20,
            satRange: 30,
            lumRange: 40,
            hueFalloff: 10,
            satFalloff: 10,
            lumFalloff: 20
        };

        const newPointState = {
            ...props.grading.pointColor,
            points: [...currentPoints, newPoint],
            activePointIndex: currentPoints.length // Select the new point
        };
        
        props.onUpdateGrading('pointColor', newPointState, true);
        // Do not switch tool back immediately to allow rapid sampling if desired,
        // or switch back if standard behavior is preferred. Let's keep it active for "Add Mode".
    };

    return (
        <div className="absolute inset-0 pt-10 flex bg-[#050505] text-zinc-200 overflow-hidden font-['Inter']">
            
            {/* Left Rail (Navigation) */}
            <div className="w-12 shrink-0 flex flex-col items-center py-4 gap-4 bg-[#09090b] border-r border-white/5 z-30">
                <Tooltip content="Media Library" side="right">
                    <button 
                        onClick={() => handleLeftRailClick('library')}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${leftMode === 'library' ? 'bg-zinc-100 text-black' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                    >
                        <Icon component={Images} size={18} weight={leftMode === 'library' ? 'fill' : 'regular'} />
                    </button>
                </Tooltip>
            </div>

            {/* Left Drawer (Library/Scopes) */}
            <AnimatePresence initial={false}>
                {leftMode && (
                    <motion.div 
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 280, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="shrink-0 h-full flex flex-col border-r border-white/5 z-20 bg-[#0c0c0e] overflow-hidden"
                    >
                        <div className="w-[280px] h-full flex flex-col">
                            {leftMode === 'library' && (
                                <LibraryPanel 
                                    sessionMedia={props.sessionMedia}
                                    currentMediaId={props.media.id}
                                    onSelectMedia={props.onSelectMedia}
                                    onImportClick={props.onImportClick}
                                    grading={props.grading}
                                    media={props.media}
                                    isPlaying={props.isPlaying}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Center Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative z-10">
                
                {/* Viewport Toolbar */}
                <div className="h-10 border-b border-white/5 bg-[#09090b] flex items-center justify-between px-4 select-none">
                    
                    {/* Media Info */}
                    <div className="flex items-center gap-3 opacity-80">
                         <Icon component={SquaresFour} size={16} className="text-zinc-500" />
                         <span className="text-xs font-medium text-zinc-300 truncate max-w-[200px]">{props.media.name || 'No Media Selected'}</span>
                         {props.media.width ? <span className="text-[10px] font-mono text-zinc-600 px-2 py-0.5 bg-white/5 rounded">{props.media.width} × {props.media.height}</span> : null}
                    </div>

                    {/* Tools & Toggles */}
                    <div className="flex items-center gap-2">
                        {/* Tool Switcher */}
                        <div className="flex bg-white/5 rounded-md p-0.5 mr-2">
                            <Tooltip content="Pan/Zoom">
                                <button 
                                    onClick={() => props.onToolChange('move')}
                                    className={`p-1.5 rounded transition-colors ${props.activeTool === 'move' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <Icon component={Hand} size={14} weight="fill" />
                                </button>
                            </Tooltip>
                            {/* Point Picker Status */}
                            {props.activeTool === 'point-picker' && (
                                <button 
                                    className="p-1.5 rounded bg-blue-600 text-white animate-pulse"
                                    title="Pick Color"
                                    onClick={() => props.onToolChange('move')}
                                >
                                    <Icon component={Eyedropper} size={14} weight="fill" />
                                </button>
                            )}
                        </div>

                         <button 
                            onClick={triggerFit}
                            className="px-3 py-1.5 hover:bg-white/5 rounded text-zinc-400 hover:text-zinc-200 transition-colors text-[10px] font-bold uppercase tracking-wider" 
                        >
                            Fit Screen
                        </button>
                        <div className="w-px h-3 bg-white/10 mx-2" />
                        <button 
                            onClick={toggleRight}
                            className={`p-1.5 rounded transition-colors ${rightPanelOpen ? 'text-zinc-200 bg-white/10' : 'text-zinc-600 hover:text-zinc-400'}`}
                            title="Toggle Inspector"
                        >
                            <Icon component={SidebarSimple} size={16} className="scale-x-[-1]" weight={rightPanelOpen ? 'fill' : 'regular'} />
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
                    <WebGLCanvas 
                        grading={props.grading}
                        media={props.media}
                        isPlaying={props.isPlaying}
                        seekTime={props.seekSignal}
                        onMediaLoaded={props.onMediaLoaded}
                        fitSignal={fitSignal}
                        activeTool={props.activeTool}
                        onSamplePointColor={handleSamplePointColor}
                    />
                </div>

                {/* Bottom Timeline (Collapsible) */}
                {props.media.type === 'video' && (
                    <motion.div 
                        animate={{ height: bottomPanelOpen ? 120 : 0 }}
                        className="shrink-0 border-t border-white/5 bg-[#0c0c0e] flex flex-col relative z-20 overflow-hidden"
                    >
                         <Timeline 
                            duration={props.media.duration || 0} 
                            currentTime={props.media.currentTime || 0} 
                            isPlaying={props.isPlaying} 
                            onPlayPause={props.onPlayPause} 
                            onSeek={props.onSeek} 
                         />
                    </motion.div>
                )}
                 {/* Timeline Toggle (Floating if collapsed) */}
                 {props.media.type === 'video' && !bottomPanelOpen && (
                     <button 
                        onClick={toggleBottom}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-800/80 backdrop-blur-md rounded-full text-xs font-bold text-zinc-300 border border-white/10 shadow-lg z-30 hover:bg-zinc-700 hover:scale-105 transition-all"
                     >
                         Show Timeline
                     </button>
                 )}
            </div>

            {/* Right Inspector */}
            <AnimatePresence initial={false}>
                {rightPanelOpen && (
                    <motion.div 
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 340, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="shrink-0 h-full border-l border-white/5 bg-[#0c0c0e] flex flex-col z-20 overflow-hidden"
                    >
                        <div className="w-[340px] h-full flex flex-col">
                            <ControlPanel 
                                values={props.grading}
                                onChange={props.onUpdateGrading}
                                onCommit={props.onCommitGrading}
                                presets={props.presets}
                                onSavePreset={props.onSavePreset}
                                onLoadPreset={props.onLoadPreset}
                                onDeletePreset={props.onDeletePreset}
                                activeTool={props.activeTool}
                                onToolChange={props.onToolChange}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

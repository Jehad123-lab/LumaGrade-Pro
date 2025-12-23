
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ControlPanel } from '../Section/ControlPanel';
import { WebGLCanvas } from '../Section/WebGLCanvas';
import { Timeline } from '../Section/Timeline';
import { LibraryPanel } from '../Section/LibraryPanel';
import { WindowFrame } from '../Package/WindowFrame';
import { GradingParams, MediaState, Preset, ToolType, PointColorData, WebGLCanvasRef } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../Core/Icon';
import { 
    Hand,
    Eyedropper, SplitHorizontal, EyeSlash, Alien,
    Images, Faders, FilmStrip, SidebarSimple,
    Desktop, Browsers, X
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
    activeTool: ToolType;
    onToolChange: (t: ToolType) => void;
    onTimeUpdate: (t: number) => void;
    canvasRef: React.RefObject<WebGLCanvasRef>;
}

type MobileView = 'library' | 'grade' | 'timeline';

export const StudioLayout: React.FC<StudioLayoutProps> = (props) => {
    // Layout Mode
    const [layoutMode, setLayoutMode] = useState<'docked' | 'float'>('docked');

    // Desktop State (Docked)
    const [leftPanelOpen, setLeftPanelOpen] = useState(true);
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
    
    // Resizing State (Docked)
    const [leftWidth, setLeftWidth] = useState(320);
    const [rightWidth, setRightWidth] = useState(340);
    const isResizingLeft = useRef(false);
    const isResizingRight = useRef(false);

    // Float Mode State
    const [floatWindows, setFloatWindows] = useState({
        library: true,
        controls: true,
        timeline: true
    });
    const [windowOrder, setWindowOrder] = useState(['library', 'controls', 'timeline']);

    // Mobile State
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobileView, setMobileView] = useState<MobileView>('grade');
    const [fitSignal, setFitSignal] = useState(0);

    const triggerFit = () => setFitSignal(s => s + 1);

    // Window Resize Listener
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Float Window Helpers
    const toggleFloatWindow = (id: keyof typeof floatWindows) => {
        setFloatWindows(prev => ({ ...prev, [id]: !prev[id] }));
        if (!floatWindows[id]) bringToFront(id as string);
    };

    const bringToFront = (id: string) => {
        setWindowOrder(prev => [...prev.filter(x => x !== id), id]);
    };
    
    const getZIndex = (id: string) => 10 + windowOrder.indexOf(id);

    // Resize Handlers
    const startResizingLeft = useCallback(() => {
        isResizingLeft.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingLeft.current) return;
            const newWidth = Math.max(280, Math.min(e.clientX, 600)); // Min 280, Max 600
            setLeftWidth(newWidth);
        };
    
        const handleMouseUp = () => {
            isResizingLeft.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, []);
    
    const startResizingRight = useCallback(() => {
        isResizingRight.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingRight.current) return;
            const newWidth = Math.max(340, Math.min(window.innerWidth - e.clientX, 600)); // Min 340, Max 600
            setRightWidth(newWidth);
        };
    
        const handleMouseUp = () => {
            isResizingRight.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, []);

    // Handlers
    const handleSamplePointColor = (h: number, s: number, l: number) => {
        const currentPoints = props.grading.pointColor.points || [];
        if (currentPoints.length >= 8) {
            alert("Maximum 8 color points reached.");
            return;
        }
        const newPoint: PointColorData = {
            id: Date.now().toString(),
            active: true,
            srcHue: h, srcSat: s, srcLum: l,
            hueShift: 0, satShift: 0, lumShift: 0,
            hueRange: 20, satRange: 30, lumRange: 40,
            hueFalloff: 10, satFalloff: 10, lumFalloff: 20
        };
        const newPointState = {
            ...props.grading.pointColor,
            points: [...currentPoints, newPoint],
            activePointIndex: currentPoints.length
        };
        props.onUpdateGrading('pointColor', newPointState, true);
    };

    const handleSplitUpdate = (pos: number) => {
        props.onUpdateGrading('splitPosition', pos, false);
    };

    // Shared Toolbar Logic
    const renderToolbarItems = (mode: 'docked' | 'float') => (
        <>
             <div className="flex bg-white/5 rounded-lg p-0.5">
                <Tooltip content="Pan/Zoom">
                    <button 
                        onClick={() => props.onToolChange('move')}
                        className={`p-1.5 rounded-md transition-all ${props.activeTool === 'move' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Icon component={Hand} size={16} weight="fill" />
                    </button>
                </Tooltip>
                {props.activeTool === 'point-picker' && (
                    <button 
                        className="p-1.5 rounded-md bg-blue-600 text-white animate-pulse"
                        onClick={() => props.onToolChange('move')}
                    >
                        <Icon component={Eyedropper} size={16} weight="fill" />
                    </button>
                )}
            </div>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <div className="flex bg-white/5 rounded-lg p-0.5">
                 <button
                     onClick={() => props.onUpdateGrading('falseColor', !props.grading.falseColor)}
                     className={`p-1.5 rounded-md transition-all ${props.grading.falseColor ? 'bg-purple-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                     title="False Color"
                 >
                     <Icon component={Alien} size={16} weight="fill" />
                 </button>
                 <button
                     onClick={() => props.onUpdateGrading('comparisonMode', props.grading.comparisonMode === 'split' ? 'off' : 'split')}
                     className={`p-1.5 rounded-md transition-all ${props.grading.comparisonMode === 'split' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                     title="Split Comparison"
                 >
                     <Icon component={SplitHorizontal} size={16} weight="fill" />
                 </button>
                 <button
                     onClick={() => props.onUpdateGrading('comparisonMode', props.grading.comparisonMode === 'toggle' ? 'off' : 'toggle')}
                     className={`p-1.5 rounded-md transition-all ${props.grading.comparisonMode === 'toggle' ? 'bg-red-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                     title="Toggle Comparison"
                 >
                     <Icon component={EyeSlash} size={16} weight="fill" />
                 </button>
            </div>

            <div className="w-px h-4 bg-white/10 mx-1" />
            
            <button 
                onClick={triggerFit}
                className="px-3 py-1.5 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-300 text-[10px] font-bold uppercase tracking-wider transition-colors" 
            >
                Fit
            </button>

            {mode === 'docked' && (
                <>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <Tooltip content="Switch to Float Mode">
                        <button 
                            onClick={() => setLayoutMode('float')}
                            className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            <Icon component={Browsers} size={18} />
                        </button>
                    </Tooltip>
                    
                    <button 
                        onClick={() => setRightPanelOpen(!rightPanelOpen)}
                        className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 ml-1"
                    >
                        <Icon component={SidebarSimple} size={18} className="scale-x-[-1]" />
                    </button>
                </>
            )}

            {mode === 'float' && (
                <>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <Tooltip content="Docked Mode">
                        <button 
                            onClick={() => setLayoutMode('docked')}
                            className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            <Icon component={Desktop} size={18} />
                        </button>
                    </Tooltip>
                </>
            )}
        </>
    );

    // --- RENDER ---

    return (
        <div className="flex flex-col h-full w-full bg-[#050505] text-zinc-200 overflow-hidden font-['Inter']">
            
            {layoutMode === 'docked' ? (
                /* --- DOCKED LAYOUT --- */
                <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
                    {/* Left Panel */}
                    <AnimatePresence mode='popLayout'>
                        {(leftPanelOpen || (isMobile && mobileView === 'library')) && (
                            <motion.div 
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: isMobile ? '100%' : leftWidth, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                                className={`${isMobile && mobileView !== 'library' ? 'hidden' : 'flex'} md:flex flex-col border-r border-white/5 bg-[#0c0c0e] z-20 shrink-0 relative`}
                            >
                                <LibraryPanel 
                                    sessionMedia={props.sessionMedia}
                                    currentMediaId={props.media.id}
                                    onSelectMedia={(m) => { props.onSelectMedia(m); if(isMobile) setMobileView('grade'); }}
                                    onImportClick={props.onImportClick}
                                    grading={props.grading}
                                    media={props.media}
                                    isPlaying={props.isPlaying}
                                />
                                {!isMobile && (
                                    <div 
                                        className="absolute top-0 right-[-4px] bottom-0 w-2 cursor-col-resize z-50 hover:bg-blue-500/50 transition-colors delay-75 group"
                                        onMouseDown={startResizingLeft}
                                    >
                                        <div className="w-[1px] h-full bg-white/5 mx-auto group-hover:bg-blue-400" />
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Center Panel */}
                    <div className={`flex-1 flex flex-col min-w-0 bg-[#09090b] relative z-10 ${isMobile && mobileView !== 'grade' ? 'hidden' : 'flex'}`}>
                        {/* Toolbar */}
                        <div className="h-12 shrink-0 border-b border-white/5 bg-[#09090b] flex items-center justify-between px-4 select-none">
                            <div className="hidden md:flex items-center gap-3 opacity-60">
                                <span className="text-xs font-medium text-zinc-300 truncate max-w-[200px]">{props.media.name || 'No Media'}</span>
                                {props.media.width ? <span className="text-[10px] font-mono text-zinc-500">{props.media.width}×{props.media.height}</span> : null}
                            </div>
                            <div className="md:hidden flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Viewer</span>
                            </div>
                            <div className="flex items-center gap-1 md:gap-2">
                                {renderToolbarItems('docked')}
                            </div>
                        </div>

                        {/* Canvas */}
                        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                            <WebGLCanvas 
                                ref={props.canvasRef}
                                grading={props.grading}
                                media={props.media}
                                isPlaying={props.isPlaying}
                                seekTime={props.seekSignal}
                                onMediaLoaded={props.onMediaLoaded}
                                fitSignal={fitSignal}
                                activeTool={props.activeTool}
                                onSamplePointColor={handleSamplePointColor}
                                onUpdateSplitPosition={handleSplitUpdate}
                                onTimeUpdate={props.onTimeUpdate}
                            />
                        </div>

                        {/* Timeline */}
                        <div className="hidden md:block">
                            {props.media.type === 'video' && (
                                <motion.div 
                                    animate={{ height: bottomPanelOpen ? 120 : 0 }}
                                    className="shrink-0 border-t border-white/5 bg-[#0c0c0e] overflow-hidden"
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
                        </div>
                    </div>

                    {/* Right Panel */}
                    <AnimatePresence mode='popLayout'>
                        {(rightPanelOpen || (isMobile && mobileView === 'grade')) && (
                            <motion.div 
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: isMobile ? '100%' : rightWidth, opacity: 1, height: isMobile ? '50%' : '100%' }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                                className={`flex flex-col border-l border-white/5 bg-[#0c0c0e] z-20 shrink-0 relative ${isMobile ? 'border-l-0 border-t order-last h-[50%]' : 'h-full'}`}
                            >
                                {!isMobile && (
                                    <div 
                                        className="absolute top-0 left-[-4px] bottom-0 w-2 cursor-col-resize z-50 hover:bg-blue-500/50 transition-colors delay-75 group"
                                        onMouseDown={startResizingRight}
                                    >
                                        <div className="w-[1px] h-full bg-white/5 mx-auto group-hover:bg-blue-400" />
                                    </div>
                                )}
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
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            ) : (
                /* --- FLOAT LAYOUT --- */
                <div className="relative w-full h-full bg-black overflow-hidden select-none">
                    
                    {/* Background Canvas */}
                    <div className="absolute inset-0 z-0">
                        <WebGLCanvas 
                            ref={props.canvasRef}
                            grading={props.grading}
                            media={props.media}
                            isPlaying={props.isPlaying}
                            seekTime={props.seekSignal}
                            onMediaLoaded={props.onMediaLoaded}
                            fitSignal={fitSignal} // Responds to fit trigger
                            activeTool={props.activeTool}
                            onSamplePointColor={handleSamplePointColor}
                            onUpdateSplitPosition={handleSplitUpdate}
                            onTimeUpdate={props.onTimeUpdate}
                        />
                    </div>

                    {/* Float Mode Toolbar */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-zinc-900/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl animate-in slide-in-from-top-4 fade-in duration-500">
                         {renderToolbarItems('float')}
                         
                         <div className="w-px h-4 bg-white/10 mx-1" />
                         
                         {/* Window Toggles */}
                         <Tooltip content="Toggle Library">
                            <button onClick={() => toggleFloatWindow('library')} className={`p-1.5 rounded-full ${floatWindows.library ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <Icon component={Images} size={16} weight={floatWindows.library ? 'fill' : 'regular'} />
                            </button>
                         </Tooltip>
                         <Tooltip content="Toggle Controls">
                            <button onClick={() => toggleFloatWindow('controls')} className={`p-1.5 rounded-full ${floatWindows.controls ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <Icon component={Faders} size={16} weight={floatWindows.controls ? 'fill' : 'regular'} />
                            </button>
                         </Tooltip>
                         <Tooltip content="Toggle Timeline">
                            <button onClick={() => toggleFloatWindow('timeline')} className={`p-1.5 rounded-full ${floatWindows.timeline ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <Icon component={FilmStrip} size={16} weight={floatWindows.timeline ? 'fill' : 'regular'} />
                            </button>
                         </Tooltip>
                    </div>

                    {/* Floating Windows */}
                    <WindowFrame
                        title="Library"
                        isOpen={floatWindows.library}
                        onClose={() => toggleFloatWindow('library')}
                        onFocus={() => bringToFront('library')}
                        zIndex={getZIndex('library')}
                        width={300}
                        height={500}
                        initialPos={{ x: 20, y: 80 }}
                    >
                        <LibraryPanel 
                            sessionMedia={props.sessionMedia}
                            currentMediaId={props.media.id}
                            onSelectMedia={props.onSelectMedia}
                            onImportClick={props.onImportClick}
                            grading={props.grading}
                            media={props.media}
                            isPlaying={props.isPlaying}
                        />
                    </WindowFrame>

                    <WindowFrame
                        title="Controls"
                        isOpen={floatWindows.controls}
                        onClose={() => toggleFloatWindow('controls')}
                        onFocus={() => bringToFront('controls')}
                        zIndex={getZIndex('controls')}
                        width={360}
                        height={600}
                        initialPos={{ x: window.innerWidth - 380, y: 80 }}
                    >
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
                    </WindowFrame>

                    {props.media.type === 'video' && (
                        <WindowFrame
                            title="Timeline"
                            isOpen={floatWindows.timeline}
                            onClose={() => toggleFloatWindow('timeline')}
                            onFocus={() => bringToFront('timeline')}
                            zIndex={getZIndex('timeline')}
                            width={600}
                            height={140}
                            initialPos={{ x: window.innerWidth / 2 - 300, y: window.innerHeight - 180 }}
                        >
                             <Timeline 
                                duration={props.media.duration || 0} 
                                currentTime={props.media.currentTime || 0} 
                                isPlaying={props.isPlaying} 
                                onPlayPause={props.onPlayPause} 
                                onSeek={props.onSeek} 
                            />
                        </WindowFrame>
                    )}
                </div>
            )}

            {/* --- MOBILE BOTTOM NAVIGATION (Only in Docked) --- */}
            {layoutMode === 'docked' && isMobile && (
                <div className="md:hidden h-14 bg-[#09090b] border-t border-white/10 flex items-center justify-around shrink-0 z-50 pb-safe">
                    <button 
                        onClick={() => setMobileView('library')}
                        className={`flex flex-col items-center gap-1 p-2 ${mobileView === 'library' ? 'text-zinc-100' : 'text-zinc-600'}`}
                    >
                        <Icon component={Images} size={20} weight={mobileView === 'library' ? 'fill' : 'regular'} />
                        <span className="text-[9px] font-medium">Library</span>
                    </button>
                    
                    <button 
                        onClick={() => setMobileView('grade')}
                        className={`flex flex-col items-center gap-1 p-2 ${mobileView === 'grade' ? 'text-zinc-100' : 'text-zinc-600'}`}
                    >
                        <Icon component={Faders} size={20} weight={mobileView === 'grade' ? 'fill' : 'regular'} />
                        <span className="text-[9px] font-medium">Grade</span>
                    </button>

                    {props.media.type === 'video' && (
                        <button 
                            onClick={() => setMobileView('timeline')}
                            className={`flex flex-col items-center gap-1 p-2 ${mobileView === 'timeline' ? 'text-zinc-100' : 'text-zinc-600'}`}
                        >
                            <Icon component={FilmStrip} size={20} weight={mobileView === 'timeline' ? 'fill' : 'regular'} />
                            <span className="text-[9px] font-medium">Timeline</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

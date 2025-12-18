
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DefaultGradingParams, GradingParams, WindowState, WindowId, MediaState, Preset, DefaultPresets } from './types';
import { WindowFrame } from './components/Package/WindowFrame';
import { Panel } from './components/Core/Panel';
import { WebGLCanvas } from './components/Section/WebGLCanvas';
import { ControlPanel } from './components/Section/ControlPanel';
import { Timeline } from './components/Section/Timeline';
import { ThemeProvider, useTheme } from './components/Core/ThemeContext';
import { 
  Aperture, Faders, FilmStrip, ImageSquare, 
  Layout, Browsers, Sun, Moon, ArrowCounterClockwise, ArrowClockwise, Keyboard,
  FolderOpen
} from '@phosphor-icons/react';
import { Icon } from './components/Core/Icon';
import { motion, AnimatePresence } from 'framer-motion';

type LayoutMode = 'float' | 'studio';

const MainApp: React.FC = () => {
  // --- State ---
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('float');
  const [grading, setGrading] = useState<GradingParams>(DefaultGradingParams);
  const [history, setHistory] = useState<GradingParams[]>([DefaultGradingParams]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const { theme, toggleTheme } = useTheme();
  
  const [media, setMedia] = useState<MediaState>({
    url: null, type: null, width: 0, height: 0, duration: 0, currentTime: 0, isPlaying: false
  });

  // Presets State
  const [presets, setPresets] = useState<Preset[]>(() => {
      try {
          const saved = localStorage.getItem('luma_presets');
          return saved ? JSON.parse(saved) : DefaultPresets;
      } catch (e) {
          return DefaultPresets;
      }
  });

  useEffect(() => {
      localStorage.setItem('luma_presets', JSON.stringify(presets));
  }, [presets]);

  const [windows, setWindows] = useState<Record<WindowId, WindowState>>({
    canvas: { id: 'canvas', isOpen: true, title: 'Viewer', position: { x: 50, y: 50 }, zIndex: 10 },
    controls: { id: 'controls', isOpen: true, title: 'Grade', position: { x: 50, y: 50 }, zIndex: 11 },
    timeline: { id: 'timeline', isOpen: false, title: 'Timeline', position: { x: 50, y: 50 }, zIndex: 12 },
    info: { id: 'info', isOpen: false, title: 'Meta', position: { x: 0, y: 0 }, zIndex: 9 },
    shortcuts: { id: 'shortcuts', isOpen: false, title: 'Shortcuts', position: { x: 0, y: 0 }, zIndex: 15 }
  });

  const [seekSignal, setSeekSignal] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- History & Undo/Redo ---

  const addToHistory = useCallback((newState: GradingParams) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      if (JSON.stringify(newHistory[newHistory.length - 1]) === JSON.stringify(newState)) {
        return prev;
      }
      return [...newHistory, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGrading(history[newIndex]);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGrading(history[newIndex]);
    }
  }, [historyIndex, history]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);


  // --- Handlers ---
  
  const bringToFront = (id: WindowId) => {
    const maxZ = Math.max(...Object.values(windows).map((w: WindowState) => w.zIndex));
    if (windows[id].zIndex === maxZ) return;
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], zIndex: maxZ + 1 }
    }));
  };

  const toggleWindow = (id: WindowId) => {
    setWindows(prev => {
        const isOpen = !prev[id].isOpen;
        const maxZ = Math.max(...Object.values(prev).map((w: WindowState) => w.zIndex));
        const newZ = isOpen ? maxZ + 1 : prev[id].zIndex;
        
        if (id === 'timeline' && media.type !== 'video' && isOpen) {
            return prev;
        }

        return {
            ...prev,
            [id]: { ...prev[id], isOpen, zIndex: newZ }
        };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';

    setMedia({
        url,
        type,
        width: 0,
        height: 0,
        duration: 0,
        currentTime: 0,
        isPlaying: false
    });

    if (type === 'video') {
        setWindows(prev => ({ ...prev, timeline: { ...prev.timeline, isOpen: true } }));
    } else {
        setWindows(prev => ({ ...prev, timeline: { ...prev.timeline, isOpen: false } }));
    }
  };

  const handleExportImage = () => {
      // Find the canvas element inside the WebGLCanvas component
      const canvas = document.querySelector('canvas');
      if (canvas) {
          const url = canvas.toDataURL('image/png', 1.0);
          const a = document.createElement('a');
          a.href = url;
          a.download = `LumaGrade_Export_${Date.now()}.png`;
          a.click();
      }
  };

  // Live Update
  const updateGrading = (key: keyof GradingParams, val: number, commit = false) => {
    setGrading(prev => {
        const newState = { ...prev, [key]: val };
        if (commit) addToHistory(newState);
        return newState;
    });
  };

  // Commit on Release
  const commitGrading = () => {
    addToHistory(grading);
  };

  // Preset Handlers
  const handleSavePreset = (name: string) => {
      const newPreset: Preset = {
          id: Date.now().toString(),
          name,
          params: JSON.parse(JSON.stringify(grading)) // Deep copy
      };
      setPresets(prev => [newPreset, ...prev]);
  };

  const handleDeletePreset = (id: string) => {
      setPresets(prev => prev.filter(p => p.id !== id));
  };

  const handleLoadPreset = (preset: Preset) => {
      const newParams = JSON.parse(JSON.stringify(preset.params));
      setGrading(newParams);
      addToHistory(newParams);
  };

  // --- Components ---

  const TopBar = () => (
    <div className="absolute top-0 left-0 w-full h-12 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 flex items-center justify-between px-4 z-[100] select-none transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-black rounded-lg border border-zinc-300 dark:border-white/5 shadow-inner">
           <Icon component={Aperture} size={18} className="text-zinc-700 dark:text-zinc-200" weight="fill" />
        </div>
        <span className="text-sm font-bold tracking-widest text-zinc-800 dark:text-zinc-300 font-['Bebas_Neue'] pt-0.5 hidden sm:inline">LumaGrade Pro</span>
      </div>

      <div className="flex items-center gap-1 md:gap-4">
        {/* Undo/Redo Buttons */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-lg border border-zinc-200 dark:border-white/5">
            <button 
                onClick={undo}
                disabled={historyIndex === 0}
                className="w-8 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 dark:text-zinc-300 transition-all"
                title="Undo (Ctrl+Z)"
            >
                <Icon component={ArrowCounterClockwise} size={16} weight="bold" />
            </button>
            <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1" />
            <button 
                onClick={redo}
                disabled={historyIndex === history.length - 1}
                className="w-8 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 dark:text-zinc-300 transition-all"
                title="Redo (Ctrl+R)"
            >
                <Icon component={ArrowClockwise} size={16} weight="bold" />
            </button>
        </div>

        <div className="hidden md:flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-lg border border-zinc-200 dark:border-white/5">
            <button 
            onClick={() => setLayoutMode('float')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-all ${layoutMode === 'float' ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
            >
            <Icon component={Browsers} size={14} />
            <span className="hidden lg:inline">Float</span>
            </button>
            <button 
            onClick={() => setLayoutMode('studio')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-all ${layoutMode === 'studio' ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
            >
            <Icon component={Layout} size={14} />
            <span className="hidden lg:inline">Studio</span>
            </button>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
         {/* Export Button */}
         <button 
            onClick={handleExportImage}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 transition-colors mr-2"
            title="Export Image (PNG)"
         >
            <Icon component={ImageSquare} size={18} />
         </button>

         <button 
            onClick={() => toggleWindow('shortcuts')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 transition-colors"
            title="Keyboard Shortcuts"
         >
            <Icon component={Keyboard} size={20} weight="fill" />
         </button>
         <button 
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 transition-colors"
         >
            <Icon component={theme === 'dark' ? Sun : Moon} size={16} weight="fill" />
         </button>
         <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1" />
         <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-md text-xs font-semibold hover:bg-zinc-700 dark:hover:bg-white transition-colors shadow-lg shadow-zinc-500/10 dark:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
         >
            <Icon component={FolderOpen} size={14} weight="bold" />
            <span className="hidden sm:inline">Open Media</span>
         </button>
      </div>
    </div>
  );

  return (
    <div className="w-screen h-screen bg-zinc-50 dark:bg-[#050505] relative overflow-hidden select-none font-sans text-zinc-900 dark:text-zinc-200 flex flex-col transition-colors duration-300">
        
        {/* Background Atmosphere */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-20%] left-[20%] w-[60vw] h-[60vw] bg-zinc-300/30 dark:bg-zinc-800/20 rounded-full blur-[150px] mix-blend-multiply dark:mix-blend-screen transition-colors duration-500" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-200/30 dark:bg-blue-900/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen transition-colors duration-500" />
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
        </div>

        <TopBar />

        {/* --- Layout Content --- */}
        <div className="flex-1 relative z-10 pt-12">
            
            {/* Hidden Input */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,video/*" 
                className="hidden" 
            />

            <AnimatePresence mode="wait">
              
              {layoutMode === 'float' ? (
                <motion.div 
                  key="float"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 touch-none"
                >
                    {/* Floating Dock */}
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-2 py-2 bg-white/80 dark:bg-[#09090b]/60 backdrop-blur-xl border border-zinc-200 dark:border-white/5 rounded-full shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/5"
                    >
                        <DockItem icon={ImageSquare} label="Viewer" active={windows.canvas.isOpen} onClick={() => toggleWindow('canvas')} />
                        <DockItem icon={Faders} label="Grading" active={windows.controls.isOpen} onClick={() => toggleWindow('controls')} />
                        {media.type === 'video' && (
                            <DockItem icon={FilmStrip} label="Timeline" active={windows.timeline.isOpen} onClick={() => toggleWindow('timeline')} />
                        )}
                    </motion.div>

                    {/* Windows */}
                    <WindowFrame
                        title={windows.canvas.title} isOpen={windows.canvas.isOpen} onClose={() => toggleWindow('canvas')} onFocus={() => bringToFront('canvas')} zIndex={windows.canvas.zIndex}
                        initialPos={{ x: window.innerWidth < 768 ? 10 : window.innerWidth/2 - 350, y: window.innerWidth < 768 ? 60 : window.innerHeight/2 - 280 }} 
                        width={window.innerWidth < 768 ? window.innerWidth - 20 : 700} 
                        height={window.innerWidth < 768 ? 400 : 560}
                        className="max-w-[100vw] max-h-[85vh]"
                    >
                        <WebGLCanvas 
                            grading={grading} 
                            media={media} 
                            isPlaying={media.isPlaying || false} 
                            seekTime={seekSignal} 
                            onMediaLoaded={(data) => setMedia(prev => ({ ...prev, ...data }))}
                        />
                    </WindowFrame>

                    <WindowFrame
                        title={windows.controls.title} isOpen={windows.controls.isOpen} onClose={() => toggleWindow('controls')} onFocus={() => bringToFront('controls')} zIndex={windows.controls.zIndex}
                        initialPos={{ x: window.innerWidth < 768 ? 20 : 60, y: 120 }} 
                        width={280} 
                        height={520}
                        className="max-h-[70vh]"
                    >
                        <ControlPanel 
                            values={grading} 
                            onChange={updateGrading} 
                            onCommit={commitGrading}
                            presets={presets}
                            onSavePreset={handleSavePreset}
                            onLoadPreset={handleLoadPreset}
                            onDeletePreset={handleDeletePreset}
                        />
                    </WindowFrame>

                    <WindowFrame
                        title={windows.timeline.title} isOpen={windows.timeline.isOpen} onClose={() => toggleWindow('timeline')} onFocus={() => bringToFront('timeline')} zIndex={windows.timeline.zIndex}
                        initialPos={{ x: window.innerWidth < 768 ? 10 : window.innerWidth/2 - 350, y: window.innerHeight - 220 }} 
                        width={window.innerWidth < 768 ? window.innerWidth - 20 : 700} 
                        height={160}
                    >
                        <Timeline duration={media.duration || 0} currentTime={media.currentTime || 0} isPlaying={media.isPlaying || false} onPlayPause={() => setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }))} onSeek={(t) => { setMedia(prev => ({ ...prev, currentTime: t })); setSeekSignal(t); }} />
                    </WindowFrame>
                </motion.div>
              ) : (
                <motion.div 
                   key="studio"
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                   className="absolute inset-0 p-2 flex flex-col gap-2 overflow-auto md:overflow-hidden"
                >
                   <div className="shrink-0 md:flex-1 flex flex-col md:flex-row gap-2 min-h-0">
                      <Panel title="Viewer" className="h-[40vh] md:h-full md:flex-1 min-h-[250px]">
                          <WebGLCanvas 
                            grading={grading} 
                            media={media} 
                            isPlaying={media.isPlaying || false} 
                            seekTime={seekSignal} 
                            onMediaLoaded={(data) => setMedia(prev => ({ ...prev, ...data }))} 
                          />
                      </Panel>
                      
                      <Panel title="Inspector" className="w-full md:w-[320px] shrink-0 h-[400px] md:h-full">
                          <div className="h-full overflow-y-auto custom-scrollbar">
                              <ControlPanel 
                                values={grading} 
                                onChange={updateGrading} 
                                onCommit={commitGrading} 
                                presets={presets}
                                onSavePreset={handleSavePreset}
                                onLoadPreset={handleLoadPreset}
                                onDeletePreset={handleDeletePreset}
                              />
                              <div className="h-8 w-full" />
                          </div>
                      </Panel>
                   </div>

                   {media.type === 'video' && (
                     <Panel title="Timeline" className="h-[160px] md:h-[200px] shrink-0">
                        <Timeline duration={media.duration || 0} currentTime={media.currentTime || 0} isPlaying={media.isPlaying || false} onPlayPause={() => setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }))} onSeek={(t) => { setMedia(prev => ({ ...prev, currentTime: t })); setSeekSignal(t); }} />
                     </Panel>
                   )}
                </motion.div>
              )}

              {/* Shortcuts Window */}
              <WindowFrame
                  title={windows.shortcuts.title}
                  isOpen={windows.shortcuts.isOpen}
                  onClose={() => toggleWindow('shortcuts')}
                  onFocus={() => bringToFront('shortcuts')}
                  zIndex={windows.shortcuts.zIndex}
                  initialPos={{ x: window.innerWidth/2 - 150, y: window.innerHeight/2 - 150 }}
                  width={300}
                  height="auto"
              >
                  <div className="p-6 space-y-4 text-sm text-zinc-600 dark:text-zinc-300">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-white/10">
                          <span>Undo</span>
                          <div className="flex gap-1">
                              <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 font-mono text-xs">Ctrl</kbd>
                              <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 font-mono text-xs">Z</kbd>
                          </div>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-white/10">
                          <span>Redo</span>
                          <div className="flex gap-1">
                              <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 font-mono text-xs">Ctrl</kbd>
                              <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 font-mono text-xs">R</kbd>
                          </div>
                      </div>
                      <div className="flex justify-between items-center">
                          <span>Import</span>
                          <div className="flex gap-1">
                              <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 font-mono text-xs">Ctrl</kbd>
                              <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 font-mono text-xs">O</kbd>
                          </div>
                      </div>
                  </div>
              </WindowFrame>

            </AnimatePresence>

        </div>
    </div>
  );
};

const DockItem = ({ icon: IconComp, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => {
    return (
        <button 
            onClick={onClick}
            className="group relative flex flex-col items-center justify-center p-1"
        >
            <div className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 ${active ? 'bg-zinc-800 dark:bg-zinc-100 text-white dark:text-black scale-110 shadow-lg' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <Icon component={IconComp} size={20} weight={active ? "fill" : "regular"} />
            </div>
            
            <span className="absolute -top-12 px-3 py-1.5 bg-zinc-900 dark:bg-[#09090b] text-zinc-100 dark:text-zinc-300 text-[10px] font-medium tracking-wide rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-zinc-700 dark:border-white/10 shadow-xl whitespace-nowrap pointer-events-none transform translate-y-2 group-hover:translate-y-0">
                {label}
            </span>
            
            {active && <motion.div layoutId="dock-active" className="absolute -bottom-1 w-1 h-1 bg-zinc-800 dark:bg-white rounded-full" />}
        </button>
    );
}

const App = () => (
  <ThemeProvider>
    <MainApp />
  </ThemeProvider>
);

export default App;

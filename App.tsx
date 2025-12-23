import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DefaultGradingParams, GradingParams, MediaState, Preset, DefaultPresets, ToolType, WebGLCanvasRef } from './types';
import { WindowFrame } from './components/Package/WindowFrame';
import { ThemeProvider } from './components/Core/ThemeContext';
import { StudioLayout } from './components/App/StudioLayout';
import { ExportModal } from './components/Package/ExportModal';
import { 
  Aperture, ImageSquare, Keyboard, FolderOpen, ArrowCounterClockwise, ArrowClockwise
} from '@phosphor-icons/react';
import { Icon } from './components/Core/Icon';

const MainApp: React.FC = () => {
  const [grading, setGrading] = useState<GradingParams>(DefaultGradingParams);
  const [history, setHistory] = useState<GradingParams[]>([DefaultGradingParams]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Session Media Management
  const [sessionMedia, setSessionMedia] = useState<MediaState[]>([]);
  const [media, setMedia] = useState<MediaState>({
    id: 'default',
    url: null, name: '', type: null, width: 0, height: 0, duration: 0, currentTime: 0, isPlaying: false
  });

  const [presets, setPresets] = useState<Preset[]>(() => {
      try {
          const saved = localStorage.getItem('luma_presets');
          return saved ? JSON.parse(saved) : DefaultPresets;
      } catch (e) {
          return DefaultPresets;
      }
  });

  // Tools State
  const [activeTool, setActiveTool] = useState<ToolType>('move');
  const canvasRef = useRef<WebGLCanvasRef>(null);

  useEffect(() => {
      localStorage.setItem('luma_presets', JSON.stringify(presets));
  }, [presets]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [seekSignal, setSeekSignal] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // --- History ---
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
      // Ignore inputs
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
            e.preventDefault();
            redo();
        } else {
            e.preventDefault();
            undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Playback
      if (e.code === 'Space') {
          e.preventDefault();
          setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
      }

      // Seeking (Arrows)
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          e.preventDefault();
          const amount = e.shiftKey ? 5 : 1;
          const direction = e.code === 'ArrowLeft' ? -1 : 1;
          const delta = amount * direction;
          
          // Try to get actual video time for accuracy during playback
          const videoEl = document.querySelector('video');
          
          if (videoEl) {
              const newTime = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + delta));
              setMedia(prev => ({ ...prev, currentTime: newTime }));
              setSeekSignal(newTime);
          } else {
               setMedia(prev => {
                  const t = Math.max(0, (prev.currentTime || 0) + delta);
                  setSeekSignal(t);
                  return { ...prev, currentTime: t };
              });
          }
      }

      // Tools
      if (e.key.toLowerCase() === 'v') {
          setActiveTool('move');
      }
      if (e.key.toLowerCase() === 'i') {
          setActiveTool('point-picker');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);


  // --- Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const id = Date.now().toString();

    const newMedia: MediaState = {
        id,
        url,
        name: file.name,
        type,
        width: 0,
        height: 0,
        duration: 0,
        currentTime: 0,
        isPlaying: false,
        thumbnail: type === 'image' ? url : undefined 
    };

    setSessionMedia(prev => [...prev, newMedia]);
    setMedia(newMedia);
  };

  const handleExportClick = () => {
      setShowExportModal(true);
  };

  const handleTriggerExport = (type: 'image' | 'video') => {
      if (!canvasRef.current) {
          alert('Canvas not ready');
          return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `LumaGrade_${media.name.split('.')[0]}_${timestamp}.${type === 'image' ? 'png' : 'webm'}`;
      
      if (type === 'image') {
          canvasRef.current.exportImage(filename);
          setShowExportModal(false);
      } else {
          setIsExporting(true);
          setExportProgress(0);
          
          canvasRef.current.exportVideo(
              filename, 
              (progress) => setExportProgress(progress),
              () => {
                  setIsExporting(false);
                  setShowExportModal(false);
                  setExportProgress(0);
              }
          );
      }
  };

  // Fixed type for val to allow any value (number, object, string)
  const updateGrading = (key: keyof GradingParams, val: any, commit = false) => {
    setGrading(prev => {
        const newState = { ...prev, [key]: val };
        if (commit) addToHistory(newState);
        return newState;
    });
  };

  const commitGrading = () => {
    addToHistory(grading);
  };

  // Preset Handlers
  const handleSavePreset = (name: string) => {
      const newPreset: Preset = {
          id: Date.now().toString(),
          name,
          params: JSON.parse(JSON.stringify(grading))
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

  // Time Sync Handler (Throttled)
  const lastTimeUpdateRef = useRef(0);
  const handleTimeUpdate = useCallback((t: number) => {
      // Throttle to ~30fps (33ms) to keep UI smooth but not choke React
      const now = performance.now();
      if (now - lastTimeUpdateRef.current > 33) {
          setMedia(prev => {
              // Avoid update if effectively same (floating point jitter)
              if (Math.abs((prev.currentTime || 0) - t) < 0.05) return prev;
              return { ...prev, currentTime: t };
          });
          lastTimeUpdateRef.current = now;
      }
  }, []);

  const TopBar = () => (
    <div className="h-14 bg-[#09090b] border-b border-white/5 flex items-center justify-between px-4 z-[50] select-none shrink-0">
      
      {/* Brand */}
      <div className="flex items-center gap-2">
        <Icon component={Aperture} size={20} className="text-zinc-200" weight="fill" />
        <span className="text-sm font-bold tracking-widest text-zinc-200 font-['Bebas_Neue'] pt-0.5 hidden md:block">LumaGrade</span>
      </div>

      {/* History */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        <button 
            onClick={undo}
            disabled={historyIndex === 0}
            className="w-10 h-10 flex items-center justify-center rounded hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-white transition-all"
            title="Undo"
        >
            <Icon component={ArrowCounterClockwise} size={20} weight="bold" />
        </button>
        <button 
            onClick={redo}
            disabled={historyIndex === history.length - 1}
            className="w-10 h-10 flex items-center justify-center rounded hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-white transition-all"
            title="Redo"
        >
            <Icon component={ArrowClockwise} size={20} weight="bold" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
         <button 
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="hidden md:flex text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Shortcuts"
         >
            <Icon component={Keyboard} size={20} />
         </button>
         
         <div className="hidden md:block w-px h-4 bg-white/10 mx-1" />

         <button 
            onClick={handleExportClick}
            disabled={!media.url}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded text-xs font-bold uppercase tracking-wider transition-colors"
         >
            <Icon component={ImageSquare} size={16} />
            <span className="hidden md:inline">Export</span>
         </button>
         
         <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-white text-black rounded text-xs font-bold uppercase tracking-wider transition-colors"
         >
            <Icon component={FolderOpen} size={16} weight="bold" />
            <span className="hidden md:inline">Open</span>
         </button>
      </div>
    </div>
  );

  return (
    <ThemeProvider>
      <div className="w-full h-[100dvh] bg-black relative overflow-hidden select-none font-sans text-zinc-200 flex flex-col">
          <TopBar />
          
          <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*,video/*" 
              className="hidden" 
          />

          <div className="flex-1 relative z-10 overflow-hidden">
              <StudioLayout 
                  grading={grading}
                  media={media}
                  sessionMedia={sessionMedia}
                  isPlaying={media.isPlaying || false}
                  seekSignal={seekSignal}
                  onUpdateGrading={updateGrading}
                  onCommitGrading={commitGrading}
                  onMediaLoaded={(data) => setMedia(prev => ({ ...prev, ...data }))}
                  onPlayPause={() => setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                  onSeek={(t) => { setMedia(prev => ({ ...prev, currentTime: t })); setSeekSignal(t); }}
                  onSelectMedia={(m) => setMedia(m)}
                  onImportClick={() => fileInputRef.current?.click()}
                  presets={presets}
                  onSavePreset={handleSavePreset}
                  onLoadPreset={handleLoadPreset}
                  onDeletePreset={handleDeletePreset}
                  activeTool={activeTool}
                  onToolChange={setActiveTool}
                  onTimeUpdate={handleTimeUpdate}
                  canvasRef={canvasRef}
              />

              <ExportModal 
                  isOpen={showExportModal}
                  onClose={() => !isExporting && setShowExportModal(false)}
                  onExport={handleTriggerExport}
                  mediaType={media.type}
                  isExporting={isExporting}
                  progress={exportProgress}
              />

              <WindowFrame
                    title="Shortcuts"
                    isOpen={showShortcuts}
                    onClose={() => setShowShortcuts(false)}
                    onFocus={() => {}}
                    zIndex={100}
                    initialPos={{ x: window.innerWidth/2 - 150, y: window.innerHeight/2 - 200 }}
                    width={320}
                    height="auto"
              >
                  <div className="p-6 space-y-4 text-sm text-zinc-300">
                      <div className="flex justify-between items-center pb-2 border-b border-white/10">
                          <span>Undo / Redo</span>
                          <div className="flex gap-1">
                              <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">Ctrl</kbd>
                              <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">Z</kbd>
                          </div>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-white/10">
                          <span>Play / Pause</span>
                          <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">Space</kbd>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-white/10">
                          <span>Seek 1s / 5s</span>
                          <div className="flex gap-1">
                              <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">Arrows</kbd>
                              <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">Shift</kbd>
                          </div>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-white/10">
                          <span>Move Tool</span>
                          <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">V</kbd>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-white/10">
                          <span>Point Picker</span>
                          <kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs text-zinc-400">I</kbd>
                      </div>
                  </div>
              </WindowFrame>
          </div>
      </div>
    </ThemeProvider>
  );
};

export default MainApp;
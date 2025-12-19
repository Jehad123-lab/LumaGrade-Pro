
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DefaultGradingParams, GradingParams, WindowState, WindowId, MediaState, Preset, DefaultPresets } from './types';
import { WindowFrame } from './components/Package/WindowFrame';
import { WebGLCanvas } from './components/Section/WebGLCanvas';
import { ControlPanel } from './components/Section/ControlPanel';
import { Timeline } from './components/Section/Timeline';
import { ThemeProvider, useTheme } from './components/Core/ThemeContext';
import { StudioLayout } from './components/App/StudioLayout';
import { 
  Aperture, ImageSquare, Keyboard, FolderOpen, ArrowCounterClockwise, ArrowClockwise
} from '@phosphor-icons/react';
import { Icon } from './components/Core/Icon';
import { motion, AnimatePresence } from 'framer-motion';

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

  useEffect(() => {
      localStorage.setItem('luma_presets', JSON.stringify(presets));
  }, [presets]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [seekSignal, setSeekSignal] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExportImage = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
          const url = canvas.toDataURL('image/png', 1.0);
          const a = document.createElement('a');
          a.href = url;
          a.download = `LumaGrade_Export_${Date.now()}.png`;
          a.click();
      }
  };

  const updateGrading = (key: keyof GradingParams, val: number, commit = false) => {
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

  const TopBar = () => (
    <div className="absolute top-0 left-0 w-full h-10 bg-[#0c0c0e] border-b border-white/5 flex items-center justify-between px-4 z-[100] select-none">
      
      {/* Brand */}
      <div className="flex items-center gap-2">
        <Icon component={Aperture} size={18} className="text-zinc-200" weight="fill" />
        <span className="text-sm font-bold tracking-widest text-zinc-200 font-['Bebas_Neue'] pt-0.5">LumaGrade</span>
        <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider ml-2">Pro</span>
      </div>

      {/* History */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
        <button 
            onClick={undo}
            disabled={historyIndex === 0}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-white transition-all"
            title="Undo"
        >
            <Icon component={ArrowCounterClockwise} size={16} weight="bold" />
        </button>
        <button 
            onClick={redo}
            disabled={historyIndex === history.length - 1}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-white transition-all"
            title="Redo"
        >
            <Icon component={ArrowClockwise} size={16} weight="bold" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
         <button 
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Shortcuts"
         >
            <Icon component={Keyboard} size={18} />
         </button>
         
         <div className="w-px h-3 bg-white/10 mx-1" />

         <button 
            onClick={handleExportImage}
            className="flex items-center gap-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
         >
            <Icon component={ImageSquare} size={14} />
            <span>Export</span>
         </button>
         
         <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1 bg-zinc-100 hover:bg-white text-black rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
         >
            <Icon component={FolderOpen} size={14} weight="bold" />
            <span>Open</span>
         </button>
      </div>
    </div>
  );

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden select-none font-sans text-zinc-200 flex flex-col">
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
            />

            <WindowFrame
                  title="Shortcuts"
                  isOpen={showShortcuts}
                  onClose={() => setShowShortcuts(false)}
                  onFocus={() => {}}
                  zIndex={100}
                  initialPos={{ x: window.innerWidth/2 - 150, y: window.innerHeight/2 - 150 }}
                  width={300}
                  height="auto"
            >
                <div className="p-6 space-y-4 text-sm text-zinc-300">
                    <div className="flex justify-between items-center pb-2 border-b border-white/10">
                        <span>Undo</span>
                        <div className="flex gap-1"><kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs">Ctrl</kbd><kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs">Z</kbd></div>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-white/10">
                        <span>Redo</span>
                        <div className="flex gap-1"><kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs">Ctrl</kbd><kbd className="px-2 py-1 rounded bg-zinc-800 font-mono text-xs">R</kbd></div>
                    </div>
                </div>
            </WindowFrame>
        </div>
    </div>
  );
};

const App = () => (
  <ThemeProvider>
    <MainApp />
  </ThemeProvider>
);

export default App;

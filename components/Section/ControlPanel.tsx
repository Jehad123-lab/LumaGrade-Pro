
import React, { useState, useRef, useEffect } from 'react';
import { Slider } from '../Core/Slider';
import { GradingParams, Preset, ToolType, PointColorData } from '../../types';
import { Curves } from './Curves';
import { ColorWheel } from '../Core/ColorWheel';
import { ColorMixer } from './ColorMixer';
import { Icon } from '../Core/Icon';
import { 
    Check, Plus, Trash, X, UploadSimple,
    Faders, Palette, ChartLineUp, Sparkle, Swatches, Triangle, Camera, Eyedropper, CaretRight, Crop,
    SquaresFour, Square
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { Tooltip } from '../Core/Tooltip';
import { parseCubeLUT } from '../../lutParser';

interface ControlPanelProps {
  values: GradingParams;
  onChange: (key: keyof GradingParams, val: any, commit?: boolean) => void;
  onCommit: () => void;
  presets: Preset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (id: string) => void;
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

// --- VISUALIZER COMPONENT (V2) ---
const RangeVisualizer = ({ 
    type, 
    center, 
    range, 
    softness, 
    hueContext 
}: { 
    type: 'hue' | 'sat' | 'lum', 
    center: number, 
    range: number, 
    softness: number,
    hueContext?: number 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        ctx.clearRect(0, 0, w, h);

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        if (type === 'hue') {
            for (let i = 0; i <= 360; i += 30) {
                grad.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
            }
        } else if (type === 'sat') {
            grad.addColorStop(0, '#333'); 
            grad.addColorStop(1, `hsl(${hueContext || 0}, 100%, 50%)`);
        } else {
            grad.addColorStop(0, '#000');
            grad.addColorStop(1, '#fff');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = idata.data;
        const width = idata.width;
        const height = idata.height;
        const maxVal = type === 'hue' ? 360 : 100;

        for (let x = 0; x < width; x++) {
            const t = x / width; 
            const val = t * maxVal;
            let dist = Math.abs(val - center);
            if (type === 'hue' && dist > 180) dist = 360 - dist;

            let maskAlpha = 1.0; 
            if (dist <= range) {
                maskAlpha = 0.0;
            } else if (dist <= range + softness) {
                const p = (dist - range) / softness;
                maskAlpha = p * p * (3.0 - 2.0 * p);
            } else {
                maskAlpha = 1.0;
            }

            const darkness = 0.85; 
            const factor = 1.0 - (maskAlpha * darkness);

            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4;
                data[idx] *= factor;
                data[idx+1] *= factor;
                data[idx+2] *= factor;
            }
        }
        ctx.putImageData(idata, 0, 0);

        const centerNorm = center / maxVal;
        const cx = centerNorm * w;
        
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillRect(cx - 1, 0, 2, h);
        
        const rangeNorm = range / maxVal;
        const rLeft = (center / maxVal) - rangeNorm;
        const rRight = (center / maxVal) + rangeNorm;
        
        const softNorm = (range + softness) / maxVal;
        const sLeft = (center / maxVal) - softNorm;
        const sRight = (center / maxVal) + softNorm;

        const drawTick = (posNorm: number, opacity: number, heightRatio: number) => {
            let x = posNorm * w;
            if (type === 'hue') {
                if (x < 0) x += w;
                if (x > w) x -= w;
            } else {
                x = Math.max(0, Math.min(w, x));
            }
            ctx.fillStyle = `rgba(255,255,255,${opacity})`;
            const hTick = h * heightRatio;
            const yTick = (h - hTick) / 2;
            ctx.fillRect(x - 0.5, yTick, 1, hTick);
        };

        drawTick(rLeft, 1.0, 0.6);
        drawTick(rRight, 1.0, 0.6);
        if (softness > 0) {
            drawTick(sLeft, 0.4, 0.3);
            drawTick(sRight, 0.4, 0.3);
        }

    }, [type, center, range, softness, hueContext]);

    return (
        <div className="relative w-full h-5 rounded overflow-hidden border border-white/10 bg-black shadow-inner">
            <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
    );
};

const CompactSlider = ({ label, value, min, max, onChange }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void }) => (
    <div className="flex items-center gap-2 flex-1">
        <span className="text-[9px] font-bold text-zinc-500 uppercase w-10 shrink-0">{label}</span>
        <div className="relative flex-1 h-6 flex items-center group cursor-ew-resize">
            <input 
                type="range" min={min} max={max} step={0.1}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="absolute inset-0 opacity-0 z-10 w-full h-full cursor-ew-resize"
            />
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-500 group-hover:bg-zinc-400 transition-colors" style={{ width: `${((value - min) / (max - min)) * 100}%` }} />
            </div>
            <div 
                className="absolute w-2 h-2 bg-zinc-300 rounded-full shadow-sm pointer-events-none transition-transform group-hover:scale-125"
                style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 4px)` }}
            />
        </div>
        <span className="text-[9px] font-mono text-zinc-300 w-6 text-right tabular-nums">
            {value > 0 ? '+' : ''}{Math.round(value)}
        </span>
    </div>
);

const TONE_MODES: Record<string, { label: string, title: string, desc: string }> = {
    'standard': { label: 'Std', title: 'Standard (sRGB)', desc: 'Default web color space.' },
    'filmic': { label: 'Film', title: 'ACES Filmic', desc: 'Cinematic contrast.' },
    'agx': { label: 'AgX', title: 'AgX Punchy', desc: 'Advanced gamut compression.' },
    'soft': { label: 'Soft', title: 'Soft Clip', desc: 'Gentle highlight compression.' },
    'neutral': { label: 'Lin', title: 'Linear / Bypass', desc: 'No tone mapping.' },
};

type TabId = 'develop' | 'color' | 'curves' | 'detail' | 'effects' | 'geometry' | 'calibration' | 'presets';

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
    values, onChange, onCommit, presets, 
    onSavePreset, onLoadPreset, onDeletePreset,
    activeTool, onToolChange
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('develop');
  const [gradingTab, setGradingTab] = useState<'wheels' | 'mixer' | 'point'>('wheels');
  
  const [wheelsView, setWheelsView] = useState<'all' | 'single'>('all');
  const [singleWheelTarget, setSingleWheelTarget] = useState<'shadows' | 'midtones' | 'highlights'>('midtones');

  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [rangeCollapsed, setRangeCollapsed] = useState(false);
  
  const lutInputRef = useRef<HTMLInputElement>(null);

  // Safe access for optional defringe object in legacy presets
  const defringe = values.defringe || { purpleAmount: 0, purpleHueOffset: 0, greenAmount: 0, greenHueOffset: 0 };
  
  // -- Handlers --

  const handleColorGradeChange = (type: 'shadows' | 'midtones' | 'highlights', val: any) => {
      const newVal = { ...values.colorGrading, [type]: val };
      onChange('colorGrading', newVal, false);
  };

  const handleGlobalGradeChange = (type: 'blending' | 'balance', val: number) => {
      const newVal = { ...values.colorGrading, [type]: val };
      onChange('colorGrading', newVal, false);
  };
  
  const handlePointUpdate = (index: number, key: keyof PointColorData, val: any) => {
      const points = [...values.pointColor.points];
      points[index] = { ...points[index], [key]: val };
      onChange('pointColor', { ...values.pointColor, points }, false);
  };
  
  const togglePointActive = (index: number) => {
       const points = [...values.pointColor.points];
       points[index] = { ...points[index], active: !points[index].active };
       onChange('pointColor', { ...values.pointColor, points }, true);
  };

  const deletePoint = (index: number) => {
      const points = values.pointColor.points.filter((_, i) => i !== index);
       onChange('pointColor', { ...values.pointColor, points, activePointIndex: -1 }, true);
  };

  const handleLutUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          const content = ev.target?.result as string;
          onChange('lutStr', content, false);
          onChange('lutName', file.name, true);
      };
      reader.readAsText(file);
  };

  const TABS = [
    { id: 'develop', icon: Faders, label: 'Basic' },
    { id: 'color', icon: Palette, label: 'Color' },
    { id: 'curves', icon: ChartLineUp, label: 'Curves' },
    { id: 'detail', icon: Triangle, label: 'Detail' },
    { id: 'geometry', icon: Crop, label: 'Optics' },
    { id: 'effects', icon: Sparkle, label: 'Effects' },
    { id: 'calibration', icon: Camera, label: 'Calib' },
    { id: 'presets', icon: Swatches, label: 'Library' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#0c0c0e]">
        {/* Top Tab Bar */}
        <div className="shrink-0 h-11 border-b border-white/5 bg-[#09090b] flex items-center px-2 gap-1 overflow-x-auto select-none z-20">
            {TABS.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabId)}
                    className={`
                        shrink-0 h-8 px-3 rounded-md flex items-center gap-2 text-[11px] font-medium transition-all
                        ${activeTab === tab.id 
                            ? 'bg-zinc-100 text-zinc-950 shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}
                    `}
                >
                    <Icon component={tab.icon} size={16} weight={activeTab === tab.id ? 'fill' : 'regular'} />
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-[#0c0c0e]">
            <div className="p-4 space-y-6 max-w-full">
                
                {/* Develop Tab */}
                {activeTab === 'develop' && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                         <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Light</h3>
                            <Slider label="Exposure" value={values.exposure} min={-5} max={5} onChange={(v) => onChange('exposure', v)} onCommit={onCommit} />
                            <Slider label="Contrast" value={values.contrast} min={0} max={2} onChange={(v) => onChange('contrast', v)} onCommit={onCommit} />
                            <Slider label="Highlights" value={values.highlights} min={-1} max={1} onChange={(v) => onChange('highlights', v)} onCommit={onCommit} />
                            <Slider label="Shadows" value={values.shadows} min={-1} max={1} onChange={(v) => onChange('shadows', v)} onCommit={onCommit} />
                            <Slider label="Whites" value={values.whites} min={-1} max={1} onChange={(v) => onChange('whites', v)} onCommit={onCommit} />
                            <Slider label="Blacks" value={values.blacks} min={-1} max={1} onChange={(v) => onChange('blacks', v)} onCommit={onCommit} />
                         </div>

                         <div className="w-full h-px bg-white/5" />

                         <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Color</h3>
                            <Slider label="Temp" value={values.temperature} min={-2} max={2} onChange={(v) => onChange('temperature', v)} onCommit={onCommit} trackGradient="linear-gradient(to right, #3b82f6, #ffffff, #f97316)" />
                            <Slider label="Tint" value={values.tint} min={-2} max={2} onChange={(v) => onChange('tint', v)} onCommit={onCommit} trackGradient="linear-gradient(to right, #22c55e, #ffffff, #ec4899)" />
                            <Slider label="Vibrance" value={values.vibrance} min={-1} max={1} onChange={(v) => onChange('vibrance', v)} onCommit={onCommit} />
                            <Slider label="Saturation" value={values.saturation} min={0} max={2} onChange={(v) => onChange('saturation', v)} onCommit={onCommit} />
                         </div>

                         <div className="w-full h-px bg-white/5" />
                         
                         <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Tone Mapping</h3>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.entries(TONE_MODES).map(([key, info]) => (
                                    <button
                                        key={key}
                                        onClick={() => { onChange('toneMapping', key); onCommit(); }}
                                        className={`px-2 py-2 rounded text-[10px] font-bold border transition-all ${values.toneMapping === key ? 'bg-zinc-100 text-black border-zinc-100' : 'bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}
                                        title={info.desc}
                                    >
                                        {info.label}
                                    </button>
                                ))}
                            </div>
                         </div>
                    </motion.div>
                )}
                
                {/* Color Tab */}
                {activeTab === 'color' && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                        {/* Main Sub-tab switcher */}
                        <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5">
                            {['wheels', 'mixer', 'point'].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setGradingTab(t as any)}
                                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${gradingTab === t ? 'bg-zinc-800 text-white shadow-sm border border-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        
                        {gradingTab === 'wheels' && (
                            <div className="space-y-6">
                                {/* View Toggles (All vs Single) */}
                                <div className="flex justify-end gap-2 mb-2">
                                    <button 
                                        onClick={() => setWheelsView('all')}
                                        className={`p-1.5 rounded transition-all ${wheelsView === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}
                                        title="All Wheels"
                                    >
                                        <Icon component={SquaresFour} size={16} />
                                    </button>
                                    <button 
                                        onClick={() => setWheelsView('single')}
                                        className={`p-1.5 rounded transition-all ${wheelsView === 'single' ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}
                                        title="Single Focus"
                                    >
                                        <Icon component={Square} size={16} />
                                    </button>
                                </div>

                                {wheelsView === 'all' && (
                                    <div className="flex flex-col gap-8">
                                        <div className="bg-zinc-900/20 p-4 rounded-xl border border-white/5">
                                            <ColorWheel 
                                                label="Shadows"
                                                hue={values.colorGrading.shadows.hue}
                                                saturation={values.colorGrading.shadows.saturation}
                                                luminance={values.colorGrading.shadows.luminance}
                                                onChange={(v) => handleColorGradeChange('shadows', v)}
                                                onCommit={onCommit}
                                            />
                                        </div>
                                        <div className="bg-zinc-900/20 p-4 rounded-xl border border-white/5">
                                            <ColorWheel 
                                                label="Midtones"
                                                hue={values.colorGrading.midtones.hue}
                                                saturation={values.colorGrading.midtones.saturation}
                                                luminance={values.colorGrading.midtones.luminance}
                                                onChange={(v) => handleColorGradeChange('midtones', v)}
                                                onCommit={onCommit}
                                            />
                                        </div>
                                        <div className="bg-zinc-900/20 p-4 rounded-xl border border-white/5">
                                            <ColorWheel 
                                                label="Highlights"
                                                hue={values.colorGrading.highlights.hue}
                                                saturation={values.colorGrading.highlights.saturation}
                                                luminance={values.colorGrading.highlights.luminance}
                                                onChange={(v) => handleColorGradeChange('highlights', v)}
                                                onCommit={onCommit}
                                            />
                                        </div>
                                    </div>
                                )}

                                {wheelsView === 'single' && (
                                    <div className="space-y-4">
                                        {/* Target Switcher */}
                                        <div className="flex p-1 bg-zinc-900 rounded-lg">
                                            {(['shadows', 'midtones', 'highlights'] as const).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setSingleWheelTarget(t)}
                                                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${singleWheelTarget === t ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                        
                                        <div className="py-4 bg-zinc-900/20 rounded-xl border border-white/5 flex justify-center">
                                            <ColorWheel 
                                                label={singleWheelTarget}
                                                hue={values.colorGrading[singleWheelTarget].hue}
                                                saturation={values.colorGrading[singleWheelTarget].saturation}
                                                luminance={values.colorGrading[singleWheelTarget].luminance}
                                                onChange={(v) => handleColorGradeChange(singleWheelTarget, v)}
                                                onCommit={onCommit}
                                            />
                                        </div>
                                    </div>
                                )}
                                
                                <div className="w-full h-px bg-white/5 mt-4" />

                                {/* Shared Controls */}
                                <div className="space-y-5 px-1 pt-4">
                                    <Slider label="Blending" value={values.colorGrading.blending} min={0} max={100} onChange={(v) => handleGlobalGradeChange('blending', v)} onCommit={onCommit} />
                                    <Slider label="Balance" value={values.colorGrading.balance} min={-100} max={100} onChange={(v) => handleGlobalGradeChange('balance', v)} onCommit={onCommit} centered />
                                </div>
                            </div>
                        )}

                        {gradingTab === 'mixer' && (
                            <ColorMixer values={values.colorMixer} onChange={(ch, t, v) => {
                                const newCh = { ...values.colorMixer[ch], [t]: v };
                                onChange('colorMixer', { ...values.colorMixer, [ch]: newCh }, false);
                            }} onCommit={onCommit} />
                        )}

                        {gradingTab === 'point' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Point Color</h3>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => onChange('pointColor', { ...values.pointColor, showMask: !values.pointColor.showMask })}
                                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${values.pointColor.showMask ? 'bg-zinc-100 text-black border-zinc-100' : 'text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}
                                        >
                                            Mask
                                        </button>
                                        <Tooltip content="Pick Color">
                                            <button 
                                                onClick={() => onToolChange(activeTool === 'point-picker' ? 'move' : 'point-picker')}
                                                className={`p-1.5 rounded border transition-colors ${activeTool === 'point-picker' ? 'bg-blue-500 border-blue-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}
                                            >
                                                <Icon component={Eyedropper} size={14} weight="fill" />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>

                                {values.pointColor.points.length === 0 && (
                                    <div className="text-center py-8 border border-dashed border-white/10 rounded-lg">
                                        <p className="text-[10px] text-zinc-500">Use the Eyedropper to sample a color.</p>
                                    </div>
                                )}

                                {values.pointColor.points.map((point, idx) => (
                                    <div key={point.id} className="bg-zinc-900 rounded-lg border border-white/5 overflow-hidden">
                                        <div 
                                            className="flex items-center gap-3 px-3 py-2 cursor-pointer bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                            onClick={() => onChange('pointColor', { ...values.pointColor, activePointIndex: values.pointColor.activePointIndex === idx ? -1 : idx })}
                                        >
                                            <div 
                                                className="w-4 h-4 rounded-full shadow-sm ring-1 ring-white/10"
                                                style={{ backgroundColor: `hsl(${point.srcHue}, ${point.srcSat}%, ${point.srcLum}%)` }}
                                            />
                                            <span className="text-[11px] font-mono text-zinc-400">Sample #{idx + 1}</span>
                                            <div className="flex-1" />
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); togglePointActive(idx); }}
                                                className={`text-[10px] ${point.active ? 'text-green-500' : 'text-zinc-600'}`}
                                            >
                                                {point.active ? 'ON' : 'OFF'}
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); deletePoint(idx); }}
                                                className="text-zinc-600 hover:text-red-400 ml-2"
                                            >
                                                <Icon component={Trash} size={12} />
                                            </button>
                                            <Icon 
                                                component={CaretRight} 
                                                size={12} 
                                                className={`text-zinc-500 transition-transform ${values.pointColor.activePointIndex === idx ? 'rotate-90' : ''}`} 
                                            />
                                        </div>

                                        {values.pointColor.activePointIndex === idx && (
                                            <div className="p-3 space-y-4 border-t border-white/5 bg-black/20">
                                                 <div className="space-y-2">
                                                     <p className="text-[9px] font-bold text-zinc-500 uppercase">Shift</p>
                                                     <Slider label="Hue" value={point.hueShift} min={-180} max={180} onChange={(v) => handlePointUpdate(idx, 'hueShift', v)} onCommit={onCommit} />
                                                     <Slider label="Sat" value={point.satShift} min={-100} max={100} onChange={(v) => handlePointUpdate(idx, 'satShift', v)} onCommit={onCommit} />
                                                     <Slider label="Lum" value={point.lumShift} min={-100} max={100} onChange={(v) => handlePointUpdate(idx, 'lumShift', v)} onCommit={onCommit} />
                                                 </div>
                                                 
                                                 <div className="space-y-3 pt-2 border-t border-white/5">
                                                     <div className="flex items-center justify-between">
                                                        <p className="text-[9px] font-bold text-zinc-500 uppercase">Range</p>
                                                        <button 
                                                            onClick={() => setRangeCollapsed(!rangeCollapsed)}
                                                            className="text-[9px] text-zinc-500 hover:text-zinc-300"
                                                        >
                                                            {rangeCollapsed ? 'Expand' : 'Collapse'}
                                                        </button>
                                                     </div>
                                                     
                                                     {!rangeCollapsed && (
                                                         <>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[9px] text-zinc-600 uppercase"><span>Hue Range</span></div>
                                                                <RangeVisualizer type="hue" center={point.srcHue} range={point.hueRange} softness={point.hueFalloff} />
                                                                <div className="flex gap-2 pt-1">
                                                                    <CompactSlider label="Rng" value={point.hueRange} min={0} max={100} onChange={(v) => handlePointUpdate(idx, 'hueRange', v)} />
                                                                    <CompactSlider label="Fall" value={point.hueFalloff} min={0} max={100} onChange={(v) => handlePointUpdate(idx, 'hueFalloff', v)} />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[9px] text-zinc-600 uppercase"><span>Sat Range</span></div>
                                                                <RangeVisualizer type="sat" center={point.srcSat} range={point.satRange} softness={point.satFalloff} hueContext={point.srcHue} />
                                                                <div className="flex gap-2 pt-1">
                                                                    <CompactSlider label="Rng" value={point.satRange} min={0} max={100} onChange={(v) => handlePointUpdate(idx, 'satRange', v)} />
                                                                    <CompactSlider label="Fall" value={point.satFalloff} min={0} max={100} onChange={(v) => handlePointUpdate(idx, 'satFalloff', v)} />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[9px] text-zinc-600 uppercase"><span>Lum Range</span></div>
                                                                <RangeVisualizer type="lum" center={point.srcLum} range={point.lumRange} softness={point.lumFalloff} />
                                                                <div className="flex gap-2 pt-1">
                                                                    <CompactSlider label="Rng" value={point.lumRange} min={0} max={100} onChange={(v) => handlePointUpdate(idx, 'lumRange', v)} />
                                                                    <CompactSlider label="Fall" value={point.lumFalloff} min={0} max={100} onChange={(v) => handlePointUpdate(idx, 'lumFalloff', v)} />
                                                                </div>
                                                            </div>
                                                         </>
                                                     )}
                                                 </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Curves Tab */}
                {activeTab === 'curves' && (
                     <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                         <Curves curves={values.curves} onChange={(c, commit) => onChange('curves', c, commit)} onCommit={onCommit} />
                     </motion.div>
                )}

                {/* Detail Tab */}
                {activeTab === 'detail' && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Presence</h3>
                            <Slider label="Texture" value={values.texture} min={-1} max={1} onChange={(v) => onChange('texture', v)} onCommit={onCommit} />
                            <Slider label="Clarity" value={values.clarity} min={-1} max={1} onChange={(v) => onChange('clarity', v)} onCommit={onCommit} />
                            <Slider label="Dehaze" value={values.dehaze} min={-1} max={1} onChange={(v) => onChange('dehaze', v)} onCommit={onCommit} />
                        </div>
                        <div className="w-full h-px bg-white/5" />
                        <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Sharpening</h3>
                             <Slider label="Amount" value={values.detail.sharpening.amount} min={0} max={150} onChange={(v) => onChange('detail', { ...values.detail, sharpening: { ...values.detail.sharpening, amount: v } })} onCommit={onCommit} />
                             <Slider label="Radius" value={values.detail.sharpening.radius} min={0.5} max={3.0} step={0.1} onChange={(v) => onChange('detail', { ...values.detail, sharpening: { ...values.detail.sharpening, radius: v } })} onCommit={onCommit} />
                             <Slider label="Masking" value={values.detail.sharpening.masking} min={0} max={100} onChange={(v) => onChange('detail', { ...values.detail, sharpening: { ...values.detail.sharpening, masking: v } })} onCommit={onCommit} />
                        </div>
                        <div className="space-y-4 pt-4 border-t border-white/5">
                             <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Noise Reduction</h3>
                             <Slider label="Denoise" value={values.detail.denoise} min={0} max={100} onChange={(v) => onChange('detail', { ...values.detail, denoise: v })} onCommit={onCommit} />
                        </div>
                    </motion.div>
                )}

                {/* Effects Tab */}
                {activeTab === 'effects' && (
                     <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Vignette</h3>
                            <Slider label="Amount" value={values.vignette} min={0} max={1} onChange={(v) => onChange('vignette', v)} onCommit={onCommit} />
                            <Slider label="Midpoint" value={values.vignetteMidpoint} min={0} max={1} onChange={(v) => onChange('vignetteMidpoint', v)} onCommit={onCommit} />
                            <Slider label="Roundness" value={values.vignetteRoundness} min={-1} max={1} onChange={(v) => onChange('vignetteRoundness', v)} onCommit={onCommit} />
                            <Slider label="Feather" value={values.vignetteFeather} min={0} max={1} onChange={(v) => onChange('vignetteFeather', v)} onCommit={onCommit} />
                        </div>
                        <div className="w-full h-px bg-white/5" />
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Grain</h3>
                            <Slider label="Amount" value={values.grain} min={0} max={1} onChange={(v) => onChange('grain', v)} onCommit={onCommit} />
                            <Slider label="Size" value={values.grainSize} min={0} max={2} onChange={(v) => onChange('grainSize', v)} onCommit={onCommit} />
                            <Slider label="Roughness" value={values.grainRoughness} min={0} max={1} onChange={(v) => onChange('grainRoughness', v)} onCommit={onCommit} />
                        </div>
                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Halation</h3>
                            <Slider label="Strength" value={values.halation} min={0} max={1} onChange={(v) => onChange('halation', v)} onCommit={onCommit} />
                        </div>
                     </motion.div>
                )}
                
                {/* Geometry/Optics Tab */}
                {activeTab === 'geometry' && (
                     <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Lens Corrections</h3>
                             <Slider label="Distortion" value={values.distortion} min={-100} max={100} onChange={(v) => onChange('distortion', v)} onCommit={onCommit} />
                             <div className="flex items-center gap-2">
                                 <input type="checkbox" checked={values.distortionCrop} onChange={(e) => onChange('distortionCrop', e.target.checked)} className="rounded border-zinc-700 bg-transparent" />
                                 <label className="text-xs text-zinc-400">Constrain Crop</label>
                             </div>
                             <Slider label="Chromatic Abb." value={values.chromaticAberration} min={0} max={100} onChange={(v) => onChange('chromaticAberration', v)} onCommit={onCommit} />
                         </div>

                         <div className="w-full h-px bg-white/5" />

                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-4">Defringe Purple</h3>
                             <Slider label="Amount" value={defringe.purpleAmount} min={0} max={100} onChange={(v) => onChange('defringe', { ...defringe, purpleAmount: v })} onCommit={onCommit} />
                             <Slider label="Hue Offset" value={defringe.purpleHueOffset} min={-30} max={30} onChange={(v) => onChange('defringe', { ...defringe, purpleHueOffset: v })} onCommit={onCommit} />
                         </div>

                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-4">Defringe Green</h3>
                             <Slider label="Amount" value={defringe.greenAmount} min={0} max={100} onChange={(v) => onChange('defringe', { ...defringe, greenAmount: v })} onCommit={onCommit} />
                             <Slider label="Hue Offset" value={defringe.greenHueOffset} min={-30} max={30} onChange={(v) => onChange('defringe', { ...defringe, greenHueOffset: v })} onCommit={onCommit} />
                         </div>
                     </motion.div>
                )}

                {/* Calibration Tab */}
                {activeTab === 'calibration' && (
                     <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Shadows</h3>
                             <Slider label="Tint" value={values.calibration.shadowTint} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, shadowTint: v })} onCommit={onCommit} trackGradient="linear-gradient(to right, #22c55e, #ffffff, #ec4899)" />
                         </div>
                         <div className="w-full h-px bg-white/5" />
                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-4">Red Primary</h3>
                             <Slider label="Hue" value={values.calibration.red.hue} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, red: { ...values.calibration.red, hue: v } })} onCommit={onCommit} />
                             <Slider label="Saturation" value={values.calibration.red.saturation} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, red: { ...values.calibration.red, saturation: v } })} onCommit={onCommit} />
                         </div>
                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-4">Green Primary</h3>
                             <Slider label="Hue" value={values.calibration.green.hue} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, green: { ...values.calibration.green, hue: v } })} onCommit={onCommit} />
                             <Slider label="Saturation" value={values.calibration.green.saturation} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, green: { ...values.calibration.green, saturation: v } })} onCommit={onCommit} />
                         </div>
                         <div className="space-y-4">
                             <h3 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-4">Blue Primary</h3>
                             <Slider label="Hue" value={values.calibration.blue.hue} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, blue: { ...values.calibration.blue, hue: v } })} onCommit={onCommit} />
                             <Slider label="Saturation" value={values.calibration.blue.saturation} min={-100} max={100} onChange={(v) => onChange('calibration', { ...values.calibration, blue: { ...values.calibration.blue, saturation: v } })} onCommit={onCommit} />
                         </div>
                     </motion.div>
                )}

                {/* Presets Tab */}
                {activeTab === 'presets' && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                        {/* LUTs */}
                        <div className="space-y-3 pb-6 border-b border-white/5">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">LUT</h3>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => lutInputRef.current?.click()}
                                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs rounded border border-white/5 flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Icon component={UploadSimple} size={14} />
                                    <span>{values.lutName || 'Load .cube LUT'}</span>
                                </button>
                                <input type="file" ref={lutInputRef} className="hidden" accept=".cube" onChange={handleLutUpload} />
                                {values.lutName && (
                                    <button onClick={() => { onChange('lutStr', null, false); onChange('lutName', null, true); }} className="p-2 hover:bg-red-500/20 text-zinc-500 hover:text-red-500 rounded"><Icon component={X} size={14} /></button>
                                )}
                            </div>
                            {values.lutName && (
                                <Slider label="Intensity" value={values.lutIntensity} min={0} max={1} onChange={(v) => onChange('lutIntensity', v)} onCommit={onCommit} />
                            )}
                        </div>

                        {/* Presets List */}
                        <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saved Presets</h3>
                                <button onClick={() => setIsSaving(true)} className="text-zinc-500 hover:text-zinc-300"><Icon component={Plus} size={14} /></button>
                             </div>

                             {isSaving && (
                                 <div className="flex gap-2 mb-2 animate-in fade-in slide-in-from-top-2">
                                     <input 
                                        type="text" 
                                        autoFocus
                                        placeholder="Preset Name"
                                        className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs"
                                        value={newPresetName}
                                        onChange={(e) => setNewPresetName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newPresetName) {
                                                onSavePreset(newPresetName);
                                                setIsSaving(false);
                                                setNewPresetName('');
                                            }
                                        }}
                                     />
                                     <button onClick={() => { onSavePreset(newPresetName || 'Untitled'); setIsSaving(false); setNewPresetName(''); }} className="p-1 bg-blue-600 text-white rounded"><Icon component={Check} size={14} /></button>
                                     <button onClick={() => setIsSaving(false)} className="p-1 bg-zinc-700 rounded"><Icon component={X} size={14} /></button>
                                 </div>
                             )}

                             <div className="space-y-1">
                                 {presets.map(preset => (
                                     <div key={preset.id} className="group flex items-center justify-between p-2 rounded hover:bg-zinc-800 transition-colors cursor-pointer" onClick={() => onLoadPreset(preset)}>
                                         <span className="text-xs text-zinc-300 group-hover:text-white">{preset.name}</span>
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); onDeletePreset(preset.id); }}
                                            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-500 transition-all"
                                         >
                                             <Icon component={Trash} size={12} />
                                         </button>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    </div>
  );
};

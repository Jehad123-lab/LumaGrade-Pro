
import React, { useState, useRef } from 'react';
import { Slider } from '../Core/Slider';
import { GradingParams, Preset } from '../../types';
import { Curves } from './Curves';
import { ColorWheel } from '../Core/ColorWheel';
import { ColorMixer } from './ColorMixer';
import { Icon } from '../Core/Icon';
import { 
    Check, Plus, DownloadSimple, Trash, X, Warning, UploadSimple, Info,
    Faders, Palette, ChartLineUp, Sparkle, Swatches, SplitHorizontal, Camera, Aperture
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
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
}

// Tone Mapping Configuration
const TONE_MODES: Record<string, { label: string, title: string, desc: string }> = {
    'standard': { 
        label: 'Std', 
        title: 'Standard (sRGB)', 
        desc: 'Default web color space. Simple clipping. Good for UI/Graphics.' 
    },
    'filmic': { 
        label: 'Film', 
        title: 'ACES Filmic', 
        desc: 'Cinematic contrast and highlight rolloff. Mimics film emulation.' 
    },
    'agx': { 
        label: 'AgX', 
        title: 'AgX Punchy', 
        desc: 'Advanced gamut compression. Prevents hue skews in bright highlights.' 
    },
    'soft': { 
        label: 'Soft', 
        title: 'Soft Clip', 
        desc: 'Gentle highlight compression. Retains saturation better than Filmic.' 
    },
    'neutral': { 
        label: 'Lin', 
        title: 'Linear / Bypass', 
        desc: 'No tone mapping. Pure output. Useful for debugging or external LUTs.' 
    },
};

type TabId = 'develop' | 'color' | 'curves' | 'effects' | 'optics' | 'calibration' | 'presets';

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
    values, onChange, onCommit, presets, 
    onSavePreset, onLoadPreset, onDeletePreset
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('develop');
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const lutInputRef = useRef<HTMLInputElement>(null);
  
  // -- Handlers --

  const handleColorGradeChange = (type: 'shadows' | 'midtones' | 'highlights', val: any) => {
      const newVal = { ...values.colorGrading, [type]: val };
      onChange('colorGrading', newVal, false);
  };

  const handleGlobalGradeChange = (type: 'blending' | 'balance', val: number) => {
      const newVal = { ...values.colorGrading, [type]: val };
      onChange('colorGrading', newVal, false);
  };

  const handleCalibrationChange = (channel: 'red' | 'green' | 'blue' | 'shadowTint', type: 'hue' | 'saturation' | 'value', val: number) => {
      const newCalib = { ...values.calibration };
      if (channel === 'shadowTint') {
          newCalib.shadowTint = val;
      } else {
          newCalib[channel] = { ...newCalib[channel], [type]: val };
      }
      onChange('calibration', newCalib, false);
  };

  const handleSaveClick = () => {
      if (newPresetName.trim()) {
          onSavePreset(newPresetName);
          setNewPresetName('');
          setIsSaving(false);
      }
  };

  const handleLutUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) {
            const parsed = parseCubeLUT(content);
            if (parsed) {
                onChange('lutStr', content, false);
                onChange('lutName', file.name.replace('.cube', ''), true);
            } else {
                alert("Invalid or unsupported .cube file.");
            }
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const activeToneMode = TONE_MODES[values.toneMapping] || TONE_MODES['standard'];

  // -- Render Components --

  const TabButton = ({ id, icon, label }: { id: TabId, icon: any, label: string }) => (
      <button
        onClick={() => setActiveTab(id)}
        className={`
            flex flex-col items-center justify-center gap-1 py-3 px-1 flex-1 relative
            transition-colors duration-200 group outline-none min-w-[50px]
            ${activeTab === id ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}
        `}
      >
          <Icon component={icon} size={20} weight={activeTab === id ? 'fill' : 'regular'} />
          <span className="text-[9px] font-medium tracking-wide opacity-80">{label}</span>
          
          {activeTab === id && (
              <motion.div 
                layoutId="activeTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
              />
          )}
      </button>
  );

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e]">
        
        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-white/5 bg-[#09090b] shrink-0 z-20 overflow-x-auto custom-scrollbar">
            <TabButton id="develop" icon={Faders} label="Develop" />
            <TabButton id="color" icon={Palette} label="Color" />
            <TabButton id="curves" icon={ChartLineUp} label="Curves" />
            <TabButton id="effects" icon={Sparkle} label="FX" />
            <TabButton id="optics" icon={Aperture} label="Optics" />
            <TabButton id="calibration" icon={Camera} label="Calib" />
            <TabButton id="presets" icon={Swatches} label="Lib" />
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 relative">
            
            {/* Global Comparison Toggle (Always visible at top of content) */}
            <div className="flex flex-col gap-2 mb-4 bg-zinc-900/50 p-2 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                      <button
                        onClick={() => onChange('comparisonMode', values.comparisonMode === 'split' ? 'off' : 'split', true)}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold uppercase transition-colors border ${values.comparisonMode === 'split' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-800 border-white/5 text-zinc-500 hover:bg-zinc-700'}`}
                      >
                          <Icon component={SplitHorizontal} size={14} weight="bold" />
                          Split
                      </button>
                      <button
                        onClick={() => onChange('comparisonMode', values.comparisonMode === 'toggle' ? 'off' : 'toggle', true)}
                        className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-colors border ${values.comparisonMode === 'toggle' ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-800 border-white/5 text-zinc-500 hover:bg-zinc-700'}`}
                      >
                          Bypass
                      </button>
                  </div>
                  {values.comparisonMode === 'split' && (
                       <div className="px-1">
                           <Slider 
                                label="Split Pos"
                                value={values.splitPosition * 100}
                                min={0} max={100}
                                onChange={(v) => onChange('splitPosition', v / 100)}
                                onCommit={onCommit}
                                resetValue={50}
                           />
                       </div>
                  )}
            </div>

            <AnimatePresence mode="wait">
                
                {/* --- DEVELOP TAB --- */}
                {activeTab === 'develop' && (
                    <motion.div 
                        key="develop" 
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        {/* Tone Mapping */}
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Input Mapping</h4>
                            <div className="grid grid-cols-5 gap-1 p-1 bg-zinc-900 border border-white/5 rounded-md">
                                {Object.entries(TONE_MODES).map(([key, data]) => (
                                    <Tooltip key={key} content={data.title}>
                                        <button 
                                            onClick={() => onChange('toneMapping', key, true)}
                                            className={`
                                                w-full relative py-1.5 text-[9px] uppercase font-bold text-center rounded transition-all duration-200 border
                                                ${values.toneMapping === key 
                                                ? 'bg-zinc-800 text-white border-zinc-600' 
                                                : 'bg-transparent text-zinc-500 border-transparent hover:bg-white/5 hover:text-zinc-300'}
                                            `}
                                        >
                                            {data.label}
                                        </button>
                                    </Tooltip>
                                ))}
                            </div>
                            
                            {values.toneMapping !== 'neutral' && values.toneMapping !== 'standard' && (
                                <div className="px-1 pt-1">
                                    <Slider 
                                        label="Strength" 
                                        value={values.toneStrength} 
                                        min={0} max={1} 
                                        onChange={(v) => onChange('toneStrength', v)} 
                                        onCommit={onCommit}
                                        resetValue={1}
                                        tooltip="Blend effect"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Basic Controls */}
                        <div className="space-y-4">
                             <div className="space-y-4 border-t border-white/5 pt-4">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Light</h4>
                                <Slider label="Exposure" value={values.exposure} min={-3} max={3} onChange={(v) => onChange('exposure', v)} onCommit={onCommit} centered />
                                <Slider label="Contrast" value={values.contrast} min={0} max={2} onChange={(v) => onChange('contrast', v)} onCommit={onCommit} resetValue={1} centered />
                                <div className="grid grid-cols-2 gap-x-4">
                                     <Slider label="Highlights" value={values.highlights} min={-1} max={1} onChange={(v) => onChange('highlights', v)} onCommit={onCommit} centered />
                                     <Slider label="Shadows" value={values.shadows} min={-1} max={1} onChange={(v) => onChange('shadows', v)} onCommit={onCommit} centered />
                                     <Slider label="Whites" value={values.whites} min={-1} max={1} onChange={(v) => onChange('whites', v)} onCommit={onCommit} centered />
                                     <Slider label="Blacks" value={values.blacks} min={-1} max={1} onChange={(v) => onChange('blacks', v)} onCommit={onCommit} centered />
                                </div>
                             </div>
                             
                             <div className="space-y-4 border-t border-white/5 pt-4">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Presence</h4>
                                <Slider label="Texture" value={values.texture || 0} min={-1} max={1} onChange={(v) => onChange('texture', v)} onCommit={onCommit} centered tooltip="Enhance fine details" />
                                <Slider label="Clarity" value={values.clarity || 0} min={-1} max={1} onChange={(v) => onChange('clarity', v)} onCommit={onCommit} centered tooltip="Midtone contrast" />
                                <Slider label="Dehaze" value={values.dehaze || 0} min={-1} max={1} onChange={(v) => onChange('dehaze', v)} onCommit={onCommit} centered tooltip="Remove atmospheric haze" />
                                <div className="pt-2">
                                    <Slider label="Saturation" value={values.saturation} min={0} max={2} onChange={(v) => onChange('saturation', v)} onCommit={onCommit} resetValue={1} centered />
                                    <Slider label="Vibrance" value={values.vibrance} min={-1} max={1} onChange={(v) => onChange('vibrance', v)} onCommit={onCommit} centered />
                                </div>
                             </div>

                             <div className="space-y-4 border-t border-white/5 pt-4">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">White Balance</h4>
                                <Slider label="Temp" value={values.temperature} min={-2} max={2} onChange={(v) => onChange('temperature', v)} onCommit={onCommit} centered trackGradient="linear-gradient(to right, #3b82f6, #fcd34d)" />
                                <Slider label="Tint" value={values.tint} min={-2} max={2} onChange={(v) => onChange('tint', v)} onCommit={onCommit} centered trackGradient="linear-gradient(to right, #22c55e, #ec4899)" />
                             </div>
                        </div>
                    </motion.div>
                )}

                {/* --- COLOR TAB --- */}
                {activeTab === 'color' && (
                    <motion.div 
                        key="color"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                    >
                         {/* Color Wheels */}
                         <div className="flex flex-col items-center gap-6">
                            <ColorWheel 
                                label="Midtones"
                                hue={values.colorGrading.midtones.hue}
                                saturation={values.colorGrading.midtones.saturation}
                                luminance={values.colorGrading.midtones.luminance}
                                onChange={(v) => handleColorGradeChange('midtones', v)}
                                onCommit={onCommit}
                            />
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <ColorWheel 
                                    label="Shadows"
                                    hue={values.colorGrading.shadows.hue}
                                    saturation={values.colorGrading.shadows.saturation}
                                    luminance={values.colorGrading.shadows.luminance}
                                    onChange={(v) => handleColorGradeChange('shadows', v)}
                                    onCommit={onCommit}
                                />
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

                        {/* Wheel Params */}
                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5 space-y-3">
                            <Slider label="Range Blend" value={values.colorGrading.blending} min={0} max={100} onChange={(v) => handleGlobalGradeChange('blending', v)} onCommit={onCommit} resetValue={50} />
                            <Slider label="Range Balance" value={values.colorGrading.balance} min={-100} max={100} onChange={(v) => handleGlobalGradeChange('balance', v)} onCommit={onCommit} centered />
                        </div>

                        {/* Mixer */}
                        <div className="pt-4 border-t border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Color Mixer</h4>
                            <ColorMixer 
                                values={values.colorMixer}
                                onChange={(channel, type, val) => {
                                    const newMixer = { ...values.colorMixer };
                                    newMixer[channel] = { ...newMixer[channel], [type]: val };
                                    onChange('colorMixer', newMixer, false);
                                }}
                                onCommit={onCommit}
                            />
                        </div>
                    </motion.div>
                )}

                {/* --- CURVES TAB --- */}
                {activeTab === 'curves' && (
                    <motion.div 
                        key="curves"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    >
                        <Curves 
                            curves={values.curves} 
                            onChange={(newCurves, commit) => onChange('curves', newCurves, commit)}
                            onCommit={onCommit}
                        />
                    </motion.div>
                )}

                {/* --- EFFECTS TAB --- */}
                {activeTab === 'effects' && (
                    <motion.div 
                        key="effects"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Film Grain</h4>
                            <div className="space-y-3">
                                <Slider label="Amount" value={values.grain} min={0} max={2} onChange={(v) => onChange('grain', v)} onCommit={onCommit} />
                                <Slider label="Size" value={values.grainSize * 10} min={1} max={100} onChange={(v) => onChange('grainSize', v / 10)} onCommit={onCommit} resetValue={25} />
                                <Slider label="Roughness" value={values.grainRoughness} min={0} max={1} onChange={(v) => onChange('grainRoughness', v)} onCommit={onCommit} resetValue={0.5} />
                            </div>
                        </div>

                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Halation</h4>
                            <Slider label="Intensity" value={values.halation || 0} min={0} max={2} onChange={(v) => onChange('halation', v)} onCommit={onCommit} />
                        </div>
                    </motion.div>
                )}
                
                {/* --- OPTICS TAB --- */}
                {activeTab === 'optics' && (
                    <motion.div 
                        key="optics"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Lens</h4>
                            <div className="space-y-3">
                                <Slider label="Distortion" value={values.distortion || 0} min={-100} max={100} onChange={(v) => onChange('distortion', v)} onCommit={onCommit} centered tooltip="Barrel / Pincushion" />
                                <Slider label="Fringing" value={values.chromaticAberration || 0} min={0} max={100} onChange={(v) => onChange('chromaticAberration', v)} onCommit={onCommit} tooltip="Chromatic Aberration" />
                            </div>
                        </div>

                         <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Vignette</h4>
                            <div className="space-y-3">
                                <Slider label="Amount" value={values.vignette} min={0} max={1.5} onChange={(v) => onChange('vignette', v)} onCommit={onCommit} />
                                <Slider label="Midpoint" value={values.vignetteMidpoint * 100} min={0} max={100} onChange={(v) => onChange('vignetteMidpoint', v / 100)} onCommit={onCommit} resetValue={50} />
                                <Slider label="Feather" value={values.vignetteFeather * 100} min={0} max={100} onChange={(v) => onChange('vignetteFeather', v / 100)} onCommit={onCommit} resetValue={50} />
                            </div>
                        </div>
                    </motion.div>
                )}
                
                {/* --- CALIBRATION TAB --- */}
                {activeTab === 'calibration' && (
                    <motion.div 
                        key="calibration"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5 space-y-4">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Process 2024</h4>
                            <Slider label="Shadow Tint" value={values.calibration?.shadowTint || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('shadowTint', 'value', v)} onCommit={onCommit} centered trackGradient="linear-gradient(to right, #22c55e, #ec4899)" />
                        </div>
                        
                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5 space-y-4">
                            <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Red Primary</h4>
                            <Slider label="Hue" value={values.calibration?.red.hue || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('red', 'hue', v)} onCommit={onCommit} centered />
                            <Slider label="Saturation" value={values.calibration?.red.saturation || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('red', 'saturation', v)} onCommit={onCommit} centered />
                        </div>

                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5 space-y-4">
                            <h4 className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Green Primary</h4>
                            <Slider label="Hue" value={values.calibration?.green.hue || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('green', 'hue', v)} onCommit={onCommit} centered />
                            <Slider label="Saturation" value={values.calibration?.green.saturation || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('green', 'saturation', v)} onCommit={onCommit} centered />
                        </div>

                        <div className="bg-zinc-900/30 p-3 rounded-lg border border-white/5 space-y-4">
                            <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Blue Primary</h4>
                            <Slider label="Hue" value={values.calibration?.blue.hue || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('blue', 'hue', v)} onCommit={onCommit} centered />
                            <Slider label="Saturation" value={values.calibration?.blue.saturation || 0} min={-100} max={100} onChange={(v) => handleCalibrationChange('blue', 'saturation', v)} onCommit={onCommit} centered />
                        </div>
                    </motion.div>
                )}

                {/* --- PRESETS / LUTs TAB --- */}
                {activeTab === 'presets' && (
                    <motion.div 
                        key="presets"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                         {/* LUT Section */}
                         <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">3D LUT</h4>
                            <div className="flex flex-col gap-3">
                                {values.lutName ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between bg-zinc-800 p-2 rounded border border-white/10">
                                            <span className="text-xs font-bold text-zinc-200 truncate flex-1">{values.lutName}</span>
                                            <button onClick={() => { onChange('lutStr', null, false); onChange('lutName', null, true); }} className="text-zinc-400 hover:text-red-500">
                                                <Icon component={X} size={14} weight="bold" />
                                            </button>
                                        </div>
                                        <Slider label="Intensity" value={values.lutIntensity} min={0} max={1} onChange={(v) => onChange('lutIntensity', v)} onCommit={onCommit} resetValue={1} />
                                    </div>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => lutInputRef.current?.click()}
                                            className="w-full py-6 border border-dashed border-zinc-700 hover:border-zinc-500 hover:bg-white/5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all text-zinc-500 hover:text-zinc-300"
                                        >
                                            <Icon component={UploadSimple} size={20} />
                                            <span className="text-xs font-medium">Load .CUBE File</span>
                                        </button>
                                        <input type="file" ref={lutInputRef} accept=".cube" onChange={handleLutUpload} className="hidden" />
                                    </>
                                )}
                            </div>
                         </div>

                         {/* Presets List */}
                         <div>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saved Looks</h4>
                            </div>

                            {/* Save New */}
                            <div className="mb-4">
                                {isSaving ? (
                                    <div className="flex gap-2 animate-in fade-in">
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            placeholder="Preset Name"
                                            className="flex-1 bg-zinc-800 text-xs px-2 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500 text-white"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveClick()}
                                        />
                                        <button onClick={handleSaveClick} className="p-2 bg-green-600 text-white rounded hover:bg-green-500"><Icon component={Check} size={14} weight="bold" /></button>
                                        <button onClick={() => setIsSaving(false)} className="p-2 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"><Icon component={X} size={14} weight="bold" /></button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setIsSaving(true)}
                                        className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-900/50 border border-white/5 rounded text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                                    >
                                        <Icon component={Plus} size={14} />
                                        <span>Save Current State</span>
                                    </button>
                                )}
                            </div>

                            <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                {presets.map((preset) => (
                                    <div 
                                        key={preset.id}
                                        onClick={() => onLoadPreset(preset)}
                                        className={`
                                            group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all border border-transparent
                                            ${deleteId === preset.id ? 'bg-red-900/20 border-red-900/50' : 'hover:bg-zinc-800 hover:border-white/5'}
                                        `}
                                    >
                                        {deleteId === preset.id ? (
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-[10px] font-bold text-red-400 uppercase">Delete?</span>
                                                <div className="flex gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); onDeletePreset(preset.id); setDeleteId(null); }} className="text-red-400 hover:text-white"><Icon component={Check} size={14} weight="bold" /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDeleteId(null); }} className="text-zinc-400 hover:text-white"><Icon component={X} size={14} weight="bold" /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200">{preset.name}</span>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); setDeleteId(preset.id); }} className="text-zinc-500 hover:text-red-400">
                                                        <Icon component={Trash} size={14} weight="fill" />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                         </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    </div>
  );
};

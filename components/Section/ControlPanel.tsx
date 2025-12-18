
import React, { useState } from 'react';
import { Slider } from '../Core/Slider';
import { GradingParams, Preset } from '../../types';
import { Curves } from './Curves';
import { ColorWheel } from '../Core/ColorWheel';
import { ColorMixer } from './ColorMixer';
import { Icon } from '../Core/Icon';
import { CaretDown, SlidersHorizontal, Check, Plus, DownloadSimple, Trash, X, Warning, Palette } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from '../Core/Tooltip';

interface ControlPanelProps {
  values: GradingParams;
  onChange: (key: keyof GradingParams, val: any, commit?: boolean) => void;
  onCommit: () => void;
  presets: Preset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (id: string) => void;
}

const Section = ({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-zinc-200 dark:border-white/5 last:border-0 pb-1 mb-1">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-2.5 px-2 group text-left focus:outline-none rounded-md hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
            >
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">{title}</span>
                <Icon 
                    component={CaretDown} 
                    size={12} 
                    className={`text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-2 py-3 space-y-6">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
    values, onChange, onCommit, presets, 
    onSavePreset, onLoadPreset, onDeletePreset
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const renderToneButton = (mode: string, label: string, desc: string) => (
    <Tooltip content={desc} className="flex-1">
        <button 
            onClick={() => onChange('toneMapping', mode, true)}
            className={`w-full relative py-1.5 text-[9px] uppercase font-bold text-center rounded transition-all duration-200 border ${
                values.toneMapping === mode 
                ? 'bg-zinc-800 text-white border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:border-white shadow-sm' 
                : 'bg-transparent text-zinc-500 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
        >
            {label}
        </button>
    </Tooltip>
  );

  const handleColorGradeChange = (type: 'shadows' | 'midtones' | 'highlights', val: any) => {
      const newVal = { ...values.colorGrading, [type]: val };
      onChange('colorGrading', newVal, false);
  };

  const handleColorGradeCommit = () => {
      onCommit();
  };

  const handleGlobalGradeChange = (type: 'blending' | 'balance', val: number) => {
      const newVal = { ...values.colorGrading, [type]: val };
      onChange('colorGrading', newVal, false);
  };

  const handleSaveClick = () => {
      if (newPresetName.trim()) {
          onSavePreset(newPresetName);
          setNewPresetName('');
          setIsSaving(false);
      }
  };

  return (
    <div className="p-2 space-y-1 select-none text-zinc-800 dark:text-zinc-200 font-sans">
      
      {/* Primary Wheels Section */}
      <Section title="Color Wheels" defaultOpen={true}>
         <div className="flex flex-col gap-6">
             {/* Layout: Pyramid or Linear depending on space. Stacked is safer for narrow sidebar */}
             <div className="flex flex-col items-center gap-6 pb-4 border-b border-zinc-100 dark:border-white/5">
                 <ColorWheel 
                    label="Midtones"
                    hue={values.colorGrading.midtones.hue}
                    saturation={values.colorGrading.midtones.saturation}
                    luminance={values.colorGrading.midtones.luminance}
                    onChange={(v) => handleColorGradeChange('midtones', v)}
                    onCommit={handleColorGradeCommit}
                 />
                 <div className="grid grid-cols-2 gap-4 w-full">
                     <ColorWheel 
                        label="Shadows"
                        hue={values.colorGrading.shadows.hue}
                        saturation={values.colorGrading.shadows.saturation}
                        luminance={values.colorGrading.shadows.luminance}
                        onChange={(v) => handleColorGradeChange('shadows', v)}
                        onCommit={handleColorGradeCommit}
                     />
                     <ColorWheel 
                        label="Highlights"
                        hue={values.colorGrading.highlights.hue}
                        saturation={values.colorGrading.highlights.saturation}
                        luminance={values.colorGrading.highlights.luminance}
                        onChange={(v) => handleColorGradeChange('highlights', v)}
                        onCommit={handleColorGradeCommit}
                     />
                 </div>
             </div>
             
             {/* Global adjustments in a cleaner grid */}
             <div className="space-y-4">
                 <div className="flex items-center gap-2 mb-2">
                    <Icon component={SlidersHorizontal} size={14} className="text-zinc-400" />
                    <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Shared Params</span>
                 </div>
                 <div className="space-y-3">
                    <Slider 
                        label="Mixing"
                        value={values.colorGrading.blending}
                        min={0} max={100}
                        onChange={(v) => handleGlobalGradeChange('blending', v)}
                        onCommit={onCommit}
                        resetValue={50}
                        tooltip="Smoothness between ranges"
                    />
                    <Slider 
                        label="Balance"
                        value={values.colorGrading.balance}
                        min={-100} max={100}
                        onChange={(v) => handleGlobalGradeChange('balance', v)}
                        onCommit={onCommit}
                        tooltip="Pivot point between ranges"
                        centered
                    />
                 </div>
             </div>
         </div>
      </Section>

      <Section title="Basic Correction" defaultOpen={false}>
        <div className="space-y-4">
            <div className="space-y-3 pb-4 border-b border-zinc-100 dark:border-white/5">
                <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Tone</h4>
                <Slider 
                    label="Contrast" 
                    value={values.contrast} 
                    min={0} max={2} 
                    onChange={(v) => onChange('contrast', v)} 
                    onCommit={onCommit}
                    resetValue={1}
                    centered
                />
                <Slider 
                    label="Exposure" 
                    value={values.exposure} 
                    min={-3} max={3} 
                    onChange={(v) => onChange('exposure', v)}
                    onCommit={onCommit}
                    centered
                />
            </div>
            
            <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Presence</h4>
                 <Slider 
                    label="Saturation" 
                    value={values.saturation} 
                    min={0} max={2} 
                    onChange={(v) => onChange('saturation', v)} 
                    onCommit={onCommit}
                    resetValue={1}
                    centered
                />
                <Slider 
                    label="Vibrance" 
                    value={values.vibrance} 
                    min={-1} max={1} 
                    onChange={(v) => onChange('vibrance', v)} 
                    onCommit={onCommit}
                    centered
                />
                <Slider 
                    label="Temp" 
                    value={values.temperature} 
                    min={-2} max={2} 
                    onChange={(v) => onChange('temperature', v)} 
                    onCommit={onCommit}
                    tooltip="Color Temperature"
                    centered
                    trackGradient="linear-gradient(to right, #3b82f6, #fcd34d)"
                />
                <Slider 
                    label="Tint" 
                    value={values.tint} 
                    min={-2} max={2} 
                    onChange={(v) => onChange('tint', v)} 
                    onCommit={onCommit}
                    tooltip="Green/Magenta Tint"
                    centered
                    trackGradient="linear-gradient(to right, #22c55e, #ec4899)"
                />
            </div>
        </div>
      </Section>

      <Section title="Curves" defaultOpen={false}>
        <Curves 
            curves={values.curves} 
            onChange={(newCurves, commit) => onChange('curves', newCurves, commit)}
            onCommit={onCommit}
        />
      </Section>

      <Section title="Color Mixer" defaultOpen={false}>
         <ColorMixer 
            values={values.colorMixer}
            onChange={(channel, type, val) => {
                 const newMixer = { ...values.colorMixer };
                 newMixer[channel] = { ...newMixer[channel], [type]: val };
                 onChange('colorMixer', newMixer, false);
            }}
            onCommit={onCommit}
         />
      </Section>

      <Section title="Effects" defaultOpen={false}>
        <div className="space-y-6">
            <div>
                <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Vignette</h4>
                <Slider label="Amount" value={values.vignette} min={0} max={1.5} onChange={(v) => onChange('vignette', v)} onCommit={onCommit} />
                <Slider label="Midpoint" value={values.vignetteMidpoint * 100} min={0} max={100} onChange={(v) => onChange('vignetteMidpoint', v / 100)} onCommit={onCommit} resetValue={50} />
                <Slider label="Feather" value={values.vignetteFeather * 100} min={0} max={100} onChange={(v) => onChange('vignetteFeather', v / 100)} onCommit={onCommit} resetValue={50} />
            </div>

            <div>
                <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Grain</h4>
                <Slider label="Amount" value={values.grain} min={0} max={2} onChange={(v) => onChange('grain', v)} onCommit={onCommit} />
                <Slider label="Size" value={values.grainSize * 10} min={1} max={100} onChange={(v) => onChange('grainSize', v / 10)} onCommit={onCommit} resetValue={25} />
            </div>
        </div>
      </Section>

      <Section title="Tone Mapping" defaultOpen={false}>
        <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-md mb-4">
            {renderToneButton('standard', 'Std', 'Standard sRGB curve')}
            {renderToneButton('filmic', 'Film', 'ACES Filmic tone mapping for cinematic look')}
            {renderToneButton('agx', 'AgX', 'AgX tone mapping for high dynamic range handling')}
            {renderToneButton('soft', 'Soft', 'Soft clipping with smooth roll-off')}
        </div>
      </Section>

      <Section title="Presets" defaultOpen={false}>
          <div className="space-y-3">
              {isSaving ? (
                  <div className="flex gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <input 
                        autoFocus
                        type="text" 
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Preset Name"
                        className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-xs px-2 rounded border border-zinc-300 dark:border-zinc-700 focus:outline-none focus:border-zinc-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveClick()}
                      />
                      <button onClick={handleSaveClick} className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                          <Icon component={Check} size={14} weight="bold" />
                      </button>
                      <button onClick={() => setIsSaving(false)} className="p-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors">
                          <Icon component={X} size={14} weight="bold" />
                      </button>
                  </div>
              ) : (
                <button 
                    onClick={() => setIsSaving(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors dashed"
                >
                    <Icon component={Plus} size={14} />
                    <span>Save Current as Preset</span>
                </button>
              )}

              <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {presets.map((preset) => (
                      <div 
                        key={preset.id}
                        className={`
                            group flex items-center justify-between p-2 rounded transition-all border
                            ${deleteId === preset.id 
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50' 
                                : 'hover:bg-zinc-100 dark:hover:bg-white/5 border-transparent hover:border-zinc-200 dark:hover:border-white/5'}
                        `}
                      >
                          {deleteId === preset.id ? (
                                <div className="flex items-center justify-between w-full animate-in fade-in duration-200">
                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
                                        <Icon component={Warning} size={12} weight="fill" />
                                        Confirm?
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDeletePreset(preset.id); setDeleteId(null); }}
                                            className="p-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                                        >
                                            <Icon component={Check} size={12} weight="bold" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setDeleteId(null); }}
                                            className="p-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                        >
                                            <Icon component={X} size={12} weight="bold" />
                                        </button>
                                    </div>
                                </div>
                          ) : (
                            <>
                                <span 
                                    className="text-xs font-medium text-zinc-600 dark:text-zinc-300 truncate flex-1 cursor-pointer select-none"
                                    onClick={() => onLoadPreset(preset)}
                                >
                                    {preset.name}
                                </span>
                                
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Tooltip content="Load" side="left">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onLoadPreset(preset); }}
                                            className="p-1.5 text-zinc-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-all"
                                        >
                                            <Icon component={DownloadSimple} size={14} weight="bold" />
                                        </button>
                                    </Tooltip>
                                    <div className="w-px h-3 bg-zinc-200 dark:bg-white/10 mx-0.5" />
                                    <Tooltip content="Delete" side="left">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setDeleteId(preset.id); }}
                                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                                        >
                                            <Icon component={Trash} size={14} weight="fill" />
                                        </button>
                                    </Tooltip>
                                </div>
                            </>
                          )}
                      </div>
                  ))}
                  {presets.length === 0 && (
                      <div className="text-center py-4 text-[10px] text-zinc-400 italic">No presets saved</div>
                  )}
              </div>
          </div>
      </Section>
    </div>
  );
};

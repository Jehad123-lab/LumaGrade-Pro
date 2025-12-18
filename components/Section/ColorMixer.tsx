
import React, { useState } from 'react';
import { GradingParams } from '../../types';
import { Slider } from '../Core/Slider';
import { motion } from 'framer-motion';
import { Icon } from '../Core/Icon';
import { ArrowCounterClockwise } from '@phosphor-icons/react';

type ColorChannel = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';

const CHANNELS: { id: ColorChannel; color: string; label: string; hue: number }[] = [
    { id: 'red', color: '#ef4444', label: 'Red', hue: 0 },
    { id: 'orange', color: '#f97316', label: 'Orange', hue: 30 },
    { id: 'yellow', color: '#eab308', label: 'Yellow', hue: 60 },
    { id: 'green', color: '#22c55e', label: 'Green', hue: 120 },
    { id: 'aqua', color: '#14b8a6', label: 'Aqua', hue: 180 },
    { id: 'blue', color: '#3b82f6', label: 'Blue', hue: 240 },
    { id: 'purple', color: '#a855f7', label: 'Purple', hue: 270 },
    { id: 'magenta', color: '#ec4899', label: 'Magenta', hue: 300 },
];

interface ColorMixerProps {
    values: GradingParams['colorMixer'];
    onChange: (channel: ColorChannel, type: 'hue' | 'saturation' | 'luminance', value: number) => void;
    onCommit: () => void;
}

export const ColorMixer: React.FC<ColorMixerProps> = ({ values, onChange, onCommit }) => {
    const [selected, setSelected] = useState<ColorChannel>('red');

    const handleSwatchClick = (id: ColorChannel) => {
        setSelected(id);
    };

    const handleResetChannel = () => {
        onChange(selected, 'hue', 0);
        onChange(selected, 'saturation', 0);
        onChange(selected, 'luminance', 0);
        onCommit();
    };

    const currentValues = values[selected];
    const currentChannel = CHANNELS.find(c => c.id === selected) || CHANNELS[0];

    // --- Gradient Generators ---

    const getHueGradient = () => {
        const h = currentChannel.hue;
        return `linear-gradient(to right, hsl(${h - 60}, 90%, 50%), hsl(${h}, 90%, 50%), hsl(${h + 60}, 90%, 50%))`;
    };

    const getSatGradient = () => {
        const h = currentChannel.hue;
        return `linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;
    };

    const getLumGradient = () => {
        const h = currentChannel.hue;
        return `linear-gradient(to right, #000, hsl(${h}, 80%, 50%), #fff)`;
    };

    return (
        <div className="flex flex-col gap-4">
            
            {/* Color Swatches */}
            <div className="flex justify-between items-center px-2 py-3 bg-zinc-100 dark:bg-zinc-900/30 rounded-lg border border-zinc-200 dark:border-white/5">
                {CHANNELS.map((ch) => {
                    const isActive = selected === ch.id;
                    const channelValues = values[ch.id];
                    const hasEdits = channelValues.hue !== 0 || channelValues.saturation !== 0 || channelValues.luminance !== 0;

                    return (
                        <button
                            key={ch.id}
                            onClick={() => handleSwatchClick(ch.id)}
                            className="group relative flex flex-col items-center gap-1 focus:outline-none"
                            title={ch.label}
                        >
                            <motion.div
                                animate={{
                                    scale: isActive ? 1.1 : 1,
                                    y: isActive ? -2 : 0,
                                }}
                                className={`w-6 h-6 rounded-full transition-all duration-200 relative shadow-sm border border-black/10 dark:border-white/10`}
                                style={{ 
                                    backgroundColor: ch.color,
                                    boxShadow: isActive ? `0 4px 12px -2px ${ch.color}66` : undefined
                                }}
                            >
                                {isActive && (
                                    <motion.div 
                                        layoutId="active-ring"
                                        className="absolute -inset-[3px] rounded-full border-2 border-zinc-900 dark:border-white opacity-20"
                                        transition={{ duration: 0.2 }}
                                    />
                                )}
                                {/* Edit Dot Indicator */}
                                {hasEdits && !isActive && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-zinc-400 dark:bg-zinc-500 rounded-full" />
                                )}
                            </motion.div>
                        </button>
                    );
                })}
            </div>

            {/* Sliders Area */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4 border border-zinc-200 dark:border-white/5 space-y-5">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div 
                            className="w-3 h-3 rounded-full shadow-sm" 
                            style={{ backgroundColor: currentChannel.color }} 
                        />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-300">
                            {currentChannel.label}
                        </span>
                    </div>
                    <button 
                        onClick={handleResetChannel}
                        className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                        title={`Reset ${currentChannel.label}`}
                    >
                        <Icon component={ArrowCounterClockwise} size={12} weight="bold" />
                    </button>
                </div>

                <Slider
                    label="Hue"
                    value={currentValues.hue}
                    min={-60} max={60} step={1}
                    onChange={(v) => onChange(selected, 'hue', v)}
                    onCommit={onCommit}
                    resetValue={0}
                    tooltip="Shift Hue"
                    trackGradient={getHueGradient()}
                />
                
                <Slider
                    label="Saturation"
                    value={currentValues.saturation}
                    min={-100} max={100} step={1}
                    onChange={(v) => onChange(selected, 'saturation', v)}
                    onCommit={onCommit}
                    resetValue={0}
                    tooltip="Adjust Saturation"
                    trackGradient={getSatGradient()}
                />

                <Slider
                    label="Luminance"
                    value={currentValues.luminance}
                    min={-100} max={100} step={1}
                    onChange={(v) => onChange(selected, 'luminance', v)}
                    onCommit={onCommit}
                    resetValue={0}
                    tooltip="Adjust Luminance"
                    trackGradient={getLumGradient()}
                />
            </div>
        </div>
    );
};

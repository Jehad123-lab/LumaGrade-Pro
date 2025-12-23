
import React, { useRef, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Sun } from '@phosphor-icons/react';

interface ColorWheelProps {
    hue: number;
    saturation: number;
    luminance: number;
    onChange: (values: { hue: number, saturation: number, luminance: number }) => void;
    onCommit?: () => void;
    label?: string;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({ hue, saturation, luminance, onChange, onCommit, label }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDraggingWheel, setIsDraggingWheel] = useState(false);
    
    // --- Drawing ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // High DPI setup
        const size = 140; 
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        const center = size / 2;
        const radius = size / 2 - 2;

        // Clear
        ctx.clearRect(0, 0, size, size);

        // 1. Conic Gradient for Hue
        const conic = ctx.createConicGradient(0, center, center);
        for (let i = 0; i <= 360; i += 5) {
            conic.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
        }
        
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = conic;
        ctx.fill();
        ctx.closePath();

        // 2. Radial Gradient for Saturation
        // Center is neutral gray (no saturation), edge is full color.
        const radial = ctx.createRadialGradient(center, center, 0, center, center, radius);
        radial.addColorStop(0, '#555555'); 
        radial.addColorStop(0.2, '#555555'); 
        radial.addColorStop(1, 'transparent');

        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = radial;
        ctx.fill();
        ctx.restore();

        // Subtle Inner Shadow / Edge Darkening for depth
        const ring = ctx.createRadialGradient(center, center, radius * 0.9, center, center, radius);
        ring.addColorStop(0, 'rgba(0,0,0,0)');
        ring.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = ring;
        ctx.fill();

        // 3. Thumb Indicator
        const rad = (hue * Math.PI) / 180;
        const dist = saturation * radius; 
        const x = center + Math.cos(rad) * dist;
        const y = center + Math.sin(rad) * dist;

        // White ring
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.stroke();
        
        ctx.shadowColor = 'transparent';

    }, [hue, saturation]);

    // --- Interactions ---

    const updateFromEvent = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const center = rect.width / 2;
        const dx = clientX - rect.left - center;
        const dy = clientY - rect.top - center;

        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / center);

        onChange({ hue: angle, saturation: dist, luminance });
    };

    const handleWheelPointerDown = (e: React.PointerEvent) => {
        setIsDraggingWheel(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromEvent(e);
    };

    const handleWheelPointerMove = (e: React.PointerEvent) => {
        if (!isDraggingWheel) return;
        updateFromEvent(e);
    };

    const handleWheelPointerUp = (e: React.PointerEvent) => {
        setIsDraggingWheel(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit?.();
    };
    
    const handleResetColor = () => {
        onChange({ hue: 0, saturation: 0, luminance });
        onCommit?.();
    };

    const handleLumChange = (val: number) => {
        onChange({ hue, saturation, luminance: val });
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            {label && (
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{label}</span>
            )}
            
            <div 
                className="relative w-[140px] h-[140px] transition-transform active:scale-[0.99]"
                onDoubleClick={handleResetColor}
                title="Double click to reset"
            >
                <canvas 
                    ref={canvasRef}
                    className="w-full h-full cursor-crosshair touch-none"
                    style={{ width: '140px', height: '140px' }}
                    onPointerDown={handleWheelPointerDown}
                    onPointerMove={handleWheelPointerMove}
                    onPointerUp={handleWheelPointerUp}
                />
                
                {/* Center "Neutral" Marker */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-zinc-500 rounded-full pointer-events-none opacity-50" />
            </div>

            {/* Compact Luminance Control */}
            <div className="flex items-center gap-3 w-[120px]">
                <Icon component={Sun} size={14} weight="fill" className="text-zinc-600" />
                
                <div className="relative flex-1 h-4 flex items-center group/lum">
                    <input 
                        type="range"
                        min={-1} max={1} step={0.01}
                        value={luminance}
                        onChange={(e) => handleLumChange(parseFloat(e.target.value))}
                        onPointerUp={onCommit}
                        onDoubleClick={() => { handleLumChange(0); onCommit?.(); }}
                        className="absolute inset-0 opacity-0 z-20 cursor-ew-resize w-full h-full"
                        title="Luminance"
                    />
                    
                    {/* Track */}
                    <div className="absolute left-0 right-0 h-[2px] bg-zinc-800 rounded-full overflow-hidden">
                         {/* Neutral center marker */}
                         <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-zinc-600" />
                    </div>
                    
                    {/* Thumb */}
                    <div 
                        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-zinc-400 rounded-full shadow-sm pointer-events-none z-10 transition-all duration-100 ease-out group-hover/lum:bg-zinc-200 group-hover/lum:scale-110 ${luminance === 0 ? 'bg-zinc-600' : ''}`}
                        style={{ left: `calc(${((luminance + 1) / 2) * 100}% - 6px)` }}
                    />
                </div>
                
                <span className="text-[9px] font-mono text-zinc-500 w-7 text-right tabular-nums">
                    {luminance.toFixed(1)}
                </span>
            </div>
        </div>
    );
};

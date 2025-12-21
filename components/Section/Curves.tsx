
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Curves as CurvesType, CurvePoint } from '../../types';
import { MonotoneCubicSpline } from '../../spline';
import { Icon } from '../Core/Icon';
import { ArrowCounterClockwise, Crosshair } from '@phosphor-icons/react';
import { Slider } from '../Core/Slider';

interface CurvesProps {
  curves: CurvesType;
  onChange: (newCurves: CurvesType, commit?: boolean) => void;
  onCommit: () => void;
}

type Channel = 'l' | 'r' | 'g' | 'b';

// Region definitions (X coordinates)
const REGIONS = {
    shadows: 0.15,
    darks: 0.35,
    lights: 0.65,
    highlights: 0.85
};

export const Curves: React.FC<CurvesProps> = ({ curves, onChange, onCommit }) => {
  const [channel, setChannel] = useState<Channel>('l');
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{x: number, y: number} | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [shiftKey, setShiftKey] = useState(false);

  // --- Keyboard Listeners ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => { if(e.key === 'Shift') setShiftKey(true); };
      const handleKeyUp = (e: KeyboardEvent) => { if(e.key === 'Shift') setShiftKey(false); };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  // --- Helpers ---
  
  const getChannelColor = (c: Channel) => {
    switch(c) {
      case 'l': return '#ffffff';
      case 'r': return '#ef4444';
      case 'g': return '#22c55e';
      case 'b': return '#3b82f6';
      default: return '#ffffff';
    }
  };

  const currentPoints = useMemo(() => {
    return [...curves[channel]].sort((a, b) => a.x - b.x);
  }, [curves, channel]);

  const activePoint = useMemo(() => 
    currentPoints.find(p => p.id === activePointId), 
  [activePointId, currentPoints]);

  const spline = useMemo(() => {
    const sorted = [...currentPoints].sort((a, b) => a.x - b.x);
    if (sorted.length === 0) return new MonotoneCubicSpline([], []);

    const xs: number[] = [sorted[0].x];
    const ys: number[] = [sorted[0].y];

    for (let i = 1; i < sorted.length; i++) {
        let x = sorted[i].x;
        const prevX = xs[xs.length - 1];
        if (x <= prevX + 0.001) x = prevX + 0.001;
        xs.push(x);
        ys.push(sorted[i].y);
    }
    return new MonotoneCubicSpline(xs, ys);
  }, [currentPoints]);

  const pathData = useMemo(() => {
    const steps = 128;
    let d = `M 0 ${100 - Math.max(0, Math.min(1, spline.interpolate(0))) * 100}`;
    for (let i = 1; i <= steps; i++) {
        const x = i / steps;
        const y = Math.max(0, Math.min(1, spline.interpolate(x)));
        d += ` L ${x * 100} ${100 - y * 100}`;
    }
    return d;
  }, [spline]);

  // --- Actions ---

  const handleReset = () => {
      const defaultPoints = [
          { x: 0, y: 0, id: Math.random().toString(36).substr(2, 9) }, 
          { x: 1, y: 1, id: Math.random().toString(36).substr(2, 9) }
      ];
      onChange({ ...curves, [channel]: defaultPoints }, true);
      setActivePointId(null);
  };

  const handleManualUpdate = (val: number, type: 'in' | 'out', commit: boolean = false) => {
      if (!activePoint) return;
      const normalized = Math.max(0, Math.min(1, val / 255));
      
      const newPoints = currentPoints.map(p => {
          if (p.id === activePoint.id) {
              return { ...p, [type === 'in' ? 'x' : 'y']: normalized };
          }
          return p;
      }).sort((a, b) => a.x - b.x);

      onChange({ ...curves, [channel]: newPoints }, commit);
  };

  const handleDeletePoint = (id: string) => {
      const pointIndex = currentPoints.findIndex(p => p.id === id);
      if (pointIndex === 0 || pointIndex === currentPoints.length - 1) return;

      const newPoints = currentPoints.filter(p => p.id !== id);
      onChange({ ...curves, [channel]: newPoints }, true);
      setActivePointId(null);
  };

  // --- Region Logic ---
  const getRegionValue = (targetX: number) => {
      const y = spline.interpolate(targetX);
      // Value is the offset from linear (y=x). 
      // Mapping: +0.25 offset = +100 value. -0.25 offset = -100 value.
      // So scale factor is 400.
      return Math.round((y - targetX) * 400);
  };

  const handleRegionChange = (targetX: number, newVal: number, commit: boolean) => {
      // Convert slider value (-100 to 100) back to Y offset
      const targetY = targetX + (newVal / 400);
      const clampedY = Math.max(0, Math.min(1, targetY));
      
      let points = [...currentPoints];
      // Find closest point
      const HIT_THRESHOLD = 0.08;
      let existingPointIdx = points.findIndex(p => Math.abs(p.x - targetX) < HIT_THRESHOLD);
      
      // Avoid modifying endpoints (0 and 1) unless we really want to (usually not for regions)
      if (existingPointIdx === 0 || existingPointIdx === points.length - 1) {
          // If closest is endpoint, check if we are actually close enough to justify a new point
          if (Math.abs(points[existingPointIdx].x - targetX) > 0.01) {
              existingPointIdx = -1; // Force create new point
          } else {
              return; // Don't move endpoints via region sliders
          }
      }

      if (existingPointIdx !== -1) {
          // Update existing
          points[existingPointIdx] = { ...points[existingPointIdx], y: clampedY };
      } else {
          // Insert new
          points.push({ 
              x: targetX, 
              y: clampedY, 
              id: Math.random().toString(36).substr(2, 9) 
          });
      }
      
      points.sort((a, b) => a.x - b.x);
      onChange({ ...curves, [channel]: points }, commit);
  };


  // --- Interaction Logic ---

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointId) return; // Managed by window pointer events
    
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - ((e.clientY - rect.top) / rect.height)));

    const HIT_RADIUS = 0.05;
    const nearPoint = currentPoints.some(p => {
         const dx = p.x - x;
         const dy = p.y - y;
         return (dx*dx + dy*dy) < (HIT_RADIUS*HIT_RADIUS);
    });

    if (nearPoint) {
        setHoverPoint(null);
    } else {
        const splineY = Math.max(0, Math.min(1, spline.interpolate(x)));
        if (Math.abs(y - splineY) < 0.1) {
             setHoverPoint({ x, y: splineY });
        } else {
             setHoverPoint(null);
        }
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = 1 - ((e.clientY - rect.top) / rect.height);

    const HIT_RADIUS = 0.06;
    let targetPoint = currentPoints.find(p => {
        const dx = p.x - startX;
        const dy = p.y - startY;
        return (dx * dx + dy * dy) < (HIT_RADIUS * HIT_RADIUS);
    });

    let draggingPoints = [...currentPoints];
    let activeIndex = -1;
    let isNewPoint = false;

    if (!targetPoint) {
        const MIN_DIST = 0.02;
        const tooClose = currentPoints.some(p => Math.abs(p.x - startX) < MIN_DIST);
        
        if (!tooClose) {
            const newId = Math.random().toString(36).substr(2, 9);
            const splineY = Math.max(0, Math.min(1, spline.interpolate(startX)));
            const distToSpline = Math.abs(startY - splineY);
            const initialY = distToSpline < 0.15 ? splineY : startY;

            targetPoint = { x: startX, y: initialY, id: newId };
            draggingPoints.push(targetPoint);
            draggingPoints.sort((a, b) => a.x - b.x); 
            isNewPoint = true;
        } else {
            return; 
        }
    }

    if (!targetPoint) return;

    setActivePointId(targetPoint.id);
    setHoverPoint(null);
    svg.setPointerCapture(e.pointerId);
    
    activeIndex = draggingPoints.findIndex(p => p.id === targetPoint!.id);
    const initialPointX = draggingPoints[activeIndex].x;
    const initialPointY = draggingPoints[activeIndex].y;
    
    const EPSILON = 0.01; 
    
    const onPointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        const rawX = (moveEvent.clientX - rect.left) / rect.width;
        const rawY = 1 - ((moveEvent.clientY - rect.top) / rect.height);
        
        let newX = rawX;
        let newY = rawY;
        
        if (moveEvent.shiftKey) {
            const dx = Math.abs(rawX - initialPointX);
            const dy = Math.abs(rawY - initialPointY);
            if (dx > dy) newY = initialPointY;
            else newX = initialPointX;
        }

        const isStart = activeIndex === 0;
        const isEnd = activeIndex === draggingPoints.length - 1;
        const minX = isStart ? 0 : draggingPoints[activeIndex - 1].x + EPSILON;
        const maxX = isEnd ? 1 : draggingPoints[activeIndex + 1].x - EPSILON;
        
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(1, newY));

        const nextPoints = [...draggingPoints];
        nextPoints[activeIndex] = { ...nextPoints[activeIndex], x: newX, y: newY };
        
        onChange({ ...curves, [channel]: nextPoints }, false);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
        svg.releasePointerCapture(upEvent.pointerId);
        onCommit();
        setActivePointId(null);
        svg.removeEventListener('pointermove', onPointerMove);
        svg.removeEventListener('pointerup', onPointerUp);
    };

    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);

    if (isNewPoint) {
         onChange({ ...curves, [channel]: draggingPoints }, false);
    }
  };

  const Tab = ({ id, label }: { id: Channel, label: string }) => {
    const isActive = channel === id;
    const baseColor = getChannelColor(id);
    return (
        <button 
            onClick={() => setChannel(id)}
            className={`
                relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-200 
                ${isActive ? 'bg-zinc-100 dark:bg-zinc-100 scale-110 shadow-lg' : 'bg-transparent hover:bg-black/5 dark:hover:bg-white/10'}
            `}
        >
            <span style={{ color: isActive ? '#000' : baseColor }}>{label}</span>
            {isActive && <div className="absolute inset-0 rounded-full opacity-20 blur-sm" style={{ backgroundColor: baseColor }} />}
        </button>
    );
  };

  const NumberInput = ({ label, value, onChange, onCommit }: { label: string, value: number, onChange: (v: number) => void, onCommit: (v: number) => void }) => {
      const inputRef = useRef<HTMLInputElement>(null);
      const [localValue, setLocalValue] = useState(value.toString());

      useEffect(() => { setLocalValue(value.toString()); }, [value]);

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          setLocalValue(e.target.value);
          const parsed = parseInt(e.target.value);
          if (!isNaN(parsed)) onChange(Math.max(0, Math.min(255, parsed)));
      };

      const handleBlur = () => {
          const parsed = parseInt(localValue);
          const valid = !isNaN(parsed) ? Math.max(0, Math.min(255, parsed)) : value;
          setLocalValue(valid.toString());
          onCommit(valid);
      };

      return (
          <div className="flex items-center gap-2 group">
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider w-8">{label}</label>
              <div className="relative w-12 h-6 bg-zinc-200 dark:bg-zinc-800 rounded flex items-center justify-center overflow-hidden hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors">
                  <input
                    ref={inputRef}
                    type="number"
                    min={0} max={255}
                    value={localValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={(e) => { if(e.key === 'Enter') inputRef.current?.blur(); }}
                    className="w-full h-full bg-transparent text-center text-[10px] font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none appearance-none p-0"
                  />
              </div>
          </div>
      );
  };

  return (
    <div className="bg-zinc-50 dark:bg-[#0c0c0e] rounded-xl p-4 border border-zinc-200 dark:border-white/5 shadow-sm transition-colors">
        <div className="flex items-center justify-between mb-4 px-1">
            <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Icon component={Crosshair} size={14} className="opacity-50" />
                Curves
            </h4>
            <div className="flex items-center gap-3">
                <div className="flex gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-full">
                    <Tab id="l" label="L" />
                    <Tab id="r" label="R" />
                    <Tab id="g" label="G" />
                    <Tab id="b" label="B" />
                </div>
                <button 
                    onClick={handleReset}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 transition-colors"
                    title="Reset Channel"
                >
                    <Icon component={ArrowCounterClockwise} size={14} weight="bold" />
                </button>
            </div>
        </div>

        {/* Graph */}
        <div className="relative w-full aspect-square bg-[#121214] rounded-lg border border-white/5 overflow-visible shadow-inner ring-1 ring-black/20 select-none touch-none group">
             <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden">
                 {/* Grid Lines */}
                 {[0.25, 0.5, 0.75].map(p => (
                     <React.Fragment key={p}>
                         <div className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${p * 100}%` }} />
                         <div className="absolute left-0 right-0 h-px bg-white/10" style={{ top: `${p * 100}%` }} />
                     </React.Fragment>
                 ))}
                 
                 {/* Diagonal Reference */}
                 <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
                    <line x1="0" y1="100%" x2="100%" y2="0" stroke="white" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" strokeWidth="1" />
                    {activePoint && (
                        <g>
                            <line x1={activePoint.x * 100 + '%'} y1="0" x2={activePoint.x * 100 + '%'} y2="100%" stroke="white" strokeOpacity="0.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeWidth="1" />
                            <line x1="0" y1={(1 - activePoint.y) * 100 + '%'} x2="100%" y2={(1 - activePoint.y) * 100 + '%'} stroke="white" strokeOpacity="0.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeWidth="1" />
                        </g>
                    )}
                 </svg>
             </div>
            
            {/* Histogram Placeholder */}
            <div className="absolute inset-0 flex items-end justify-center pointer-events-none opacity-20 px-0 rounded-lg overflow-hidden mix-blend-screen">
                 <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full fill-zinc-500">
                     <defs>
                        <linearGradient id="histGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="white" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="white" stopOpacity="0" />
                        </linearGradient>
                     </defs>
                     <path d="M0,100 C10,98 20,90 30,80 C40,40 45,30 50,60 C55,80 60,85 70,50 C80,20 90,80 100,100 Z" fill="url(#histGradient)" />
                 </svg>
            </div>
            
            {/* Interaction Layer */}
            <svg 
                ref={svgRef}
                viewBox="0 0 100 100" 
                preserveAspectRatio="none" 
                className={`absolute -inset-[10px] w-[calc(100%+20px)] h-[calc(100%+20px)] overflow-visible touch-none z-10 cursor-crosshair`}
                style={{ transform: 'translate(10px, 10px)' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverPoint(null)}
            >
                <path d={pathData} fill="none" stroke={getChannelColor(channel)} strokeWidth="2" vectorEffect="non-scaling-stroke" className="drop-shadow-[0_0_5px_rgba(0,0,0,0.5)]" strokeLinecap="round" pointerEvents="none" />
                {hoverPoint && !activePointId && <circle cx={hoverPoint.x * 100} cy={100 - hoverPoint.y * 100} r="3" fill="none" stroke={getChannelColor(channel)} strokeWidth="1.5" opacity="0.5" className="pointer-events-none" />}
                {currentPoints.map((p) => {
                    const isActive = activePointId === p.id;
                    return (
                        <g key={p.id} transform={`translate(${p.x * 100}, ${100 - p.y * 100})`} onDoubleClick={(e) => { e.stopPropagation(); handleDeletePoint(p.id); }}>
                             <circle r={isActive ? 5 : 3.5} fill='#121214' stroke={getChannelColor(channel)} strokeWidth={isActive ? 2 : 1.5} className={`pointer-events-none transition-all duration-150`} />
                             <circle r="12" fill="transparent" className="cursor-pointer" />
                        </g>
                    );
                })}
            </svg>
        </div>

        {/* Input Points */}
        <div className="mt-3 h-8 flex items-center justify-between mb-4">
            {activePoint ? (
                <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <NumberInput label="IN" value={Math.round(activePoint.x * 255)} onChange={(v) => handleManualUpdate(v, 'in', false)} onCommit={(v) => handleManualUpdate(v, 'in', true)} />
                    <NumberInput label="OUT" value={Math.round(activePoint.y * 255)} onChange={(v) => handleManualUpdate(v, 'out', false)} onCommit={(v) => handleManualUpdate(v, 'out', true)} />
                </div>
            ) : (
                <div className="text-[10px] text-zinc-400 italic opacity-50 pl-1">
                    Click to add point. Shift to lock.
                </div>
            )}
        </div>
        
        {/* Region Sliders */}
        <div className="border-t border-white/5 pt-4">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Region</h4>
            <div className="space-y-1">
                <Slider 
                    layout="inline"
                    label="Highlights" 
                    value={getRegionValue(REGIONS.highlights)} 
                    min={-100} max={100} 
                    onChange={(v) => handleRegionChange(REGIONS.highlights, v, false)}
                    onCommit={(v) => handleRegionChange(REGIONS.highlights, v, true)}
                    centered 
                />
                <Slider 
                    layout="inline"
                    label="Lights" 
                    value={getRegionValue(REGIONS.lights)} 
                    min={-100} max={100} 
                    onChange={(v) => handleRegionChange(REGIONS.lights, v, false)}
                    onCommit={(v) => handleRegionChange(REGIONS.lights, v, true)}
                    centered 
                />
                <Slider 
                    layout="inline"
                    label="Darks" 
                    value={getRegionValue(REGIONS.darks)} 
                    min={-100} max={100} 
                    onChange={(v) => handleRegionChange(REGIONS.darks, v, false)}
                    onCommit={(v) => handleRegionChange(REGIONS.darks, v, true)}
                    centered 
                />
                <Slider 
                    layout="inline"
                    label="Shadows" 
                    value={getRegionValue(REGIONS.shadows)} 
                    min={-100} max={100} 
                    onChange={(v) => handleRegionChange(REGIONS.shadows, v, false)}
                    onCommit={(v) => handleRegionChange(REGIONS.shadows, v, true)}
                    centered 
                />
            </div>
        </div>
    </div>
  );
};

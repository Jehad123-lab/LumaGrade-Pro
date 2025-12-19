

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GradingParams, MediaState, CurvePoint } from '../../types';
import { FRAGMENT_SHADER, VERTEX_SHADER } from '../../constants';
import { MonotoneCubicSpline } from '../../spline';
import { WaveformMonitor } from './WaveformMonitor';
import { Icon } from '../Core/Icon';
import { ChartLine } from '@phosphor-icons/react';
import { parseCubeLUT } from '../../lutParser';

interface WebGLCanvasProps {
  grading: GradingParams;
  media: MediaState;
  onMediaLoaded: (media: Partial<MediaState>) => void;
  isPlaying: boolean;
  seekTime: number | null;
  fitSignal?: number; // Prop to trigger fit-to-screen
}

// Helper: HSL to RGB
function hslToRgb(h: number, s: number, l: number) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
  
    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
  
    return new THREE.Vector3(r + m, g + m, b + m);
}

function getTintVector(hue: number, sat: number) {
    const rgb = hslToRgb(hue, sat, 0.5);
    return new THREE.Vector3(rgb.x - 0.5, rgb.y - 0.5, rgb.z - 0.5);
}

// Order MUST match shader: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta
const MIXER_ORDER = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

export const WebGLCanvas: React.FC<WebGLCanvasProps> = ({ grading, media, onMediaLoaded, isPlaying, seekTime, fitSignal }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const curvesTextureRef = useRef<THREE.DataTexture | null>(null);
  const lutTextureRef = useRef<THREE.Data3DTexture | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Zoom/Pan State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  
  // Scope Overlay State
  const [showScope, setShowScope] = useState(false);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    const { width, height } = mountRef.current.getBoundingClientRect();

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const geometry = new THREE.PlaneGeometry(2, 2);

    const placeholderData = new Uint8Array(4 * 256 * 256);
    const placeholderTex = new THREE.DataTexture(placeholderData, 256, 256);
    placeholderTex.needsUpdate = true;

    const curvesData = new Uint8Array(256 * 4 * 4);
    const curvesTex = new THREE.DataTexture(curvesData, 256, 4);
    curvesTex.format = THREE.RGBAFormat; 
    curvesTex.minFilter = THREE.LinearFilter;
    curvesTex.magFilter = THREE.LinearFilter;
    curvesTex.generateMipmaps = false;
    curvesTex.needsUpdate = true;
    curvesTextureRef.current = curvesTex;
    
    // Default dummy 3D Texture for LUT (2x2x2)
    const dummyLutData = new Float32Array(2*2*2*4).fill(1);
    const dummyLut = new THREE.Data3DTexture(dummyLutData, 2, 2, 2);
    dummyLut.needsUpdate = true;
    lutTextureRef.current = dummyLut;
    
    // Initialize Mixer Array
    const mixerArr = new Array(8).fill(new THREE.Vector3(0,0,0));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: placeholderTex },
        tCurves: { value: curvesTex },
        tLut: { value: dummyLut },
        hasLut: { value: 0 },
        lutIntensity: { value: 0 },
        lutSize: { value: 2 },
        exposure: { value: 0 },
        contrast: { value: 1 },
        highlights: { value: 0 },
        shadows: { value: 0 },
        whites: { value: 0 },
        blacks: { value: 0 },
        saturation: { value: 1 },
        vibrance: { value: 0 },
        brightness: { value: 0 },
        temperature: { value: 0 },
        tint: { value: 0 },
        
        textureAmount: { value: 0 },
        clarity: { value: 0 },
        dehaze: { value: 0 },

        vignette: { value: 0 },
        vignetteMidpoint: { value: 0.5 },
        vignetteRoundness: { value: 0 },
        vignetteFeather: { value: 0.5 },
        distortion: { value: 0 },
        chromaticAberration: { value: 0 },

        grain: { value: 0 },
        grainSize: { value: 1.0 },
        grainRoughness: { value: 0.5 },
        halation: { value: 0 },
        sharpness: { value: 0 },
        toneMapping: { value: 0 },
        toneStrength: { value: 1 },
        
        cgShadowsColor: { value: new THREE.Vector3(0, 0, 0) },
        cgMidtonesColor: { value: new THREE.Vector3(0, 0, 0) },
        cgHighlightsColor: { value: new THREE.Vector3(0, 0, 0) },
        cgLumaParams: { value: new THREE.Vector3(0, 0, 0) },
        cgBlending: { value: 0.5 },
        cgBalance: { value: 0 },
        
        calibRed: { value: new THREE.Vector2(0, 0) },
        calibGreen: { value: new THREE.Vector2(0, 0) },
        calibBlue: { value: new THREE.Vector2(0, 0) },
        calibShadowTint: { value: 0 },

        cmOffsets: { value: mixerArr },
        resolution: { value: new THREE.Vector2(width, height) },
        comparisonMode: { value: 0 },
        splitPosition: { value: 0.5 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (media.type === 'video' && videoElementRef.current && textureRef.current) {
        if (videoElementRef.current.readyState >= videoElementRef.current.HAVE_CURRENT_DATA) {
          textureRef.current.needsUpdate = true;
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameRef.current!);
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
      dummyLut.dispose();
    };
  }, []);

  // Handle LUT Loading
  useEffect(() => {
    if (!materialRef.current || !grading.lutStr) {
        if (materialRef.current) {
            materialRef.current.uniforms.hasLut.value = 0;
        }
        return;
    }

    const parsed = parseCubeLUT(grading.lutStr);
    if (parsed) {
        lutTextureRef.current = parsed.texture;
        materialRef.current.uniforms.tLut.value = parsed.texture;
        materialRef.current.uniforms.lutSize.value = parsed.size;
        materialRef.current.uniforms.hasLut.value = 1;
    }
  }, [grading.lutStr]);

  // Update Curves
  useEffect(() => {
    if (!grading.curves || !curvesTextureRef.current) return;
    const size = 256;
    const data = new Uint8Array(size * 4 * 4); 
    const generateRow = (points: CurvePoint[], rowIndex: number) => {
        const sorted = [...points].sort((a, b) => a.x - b.x);
        const xs: number[] = [];
        const ys: number[] = [];
        if (sorted.length > 0) {
            xs.push(sorted[0].x);
            ys.push(sorted[0].y);
            for (let i = 1; i < sorted.length; i++) {
                const prevX = xs[xs.length - 1];
                let currX = sorted[i].x;
                if (currX <= prevX + 0.001) currX = prevX + 0.001;
                xs.push(currX);
                ys.push(sorted[i].y);
            }
        }
        const spline = new MonotoneCubicSpline(xs, ys);
        for (let i = 0; i < size; i++) {
            const x = i / (size - 1);
            let y = spline.interpolate(x);
            y = Math.max(0, Math.min(1, y));
            const val = Math.round(y * 255);
            const pixelIndex = (rowIndex * size + i) * 4;
            data[pixelIndex] = val;
            data[pixelIndex + 1] = val;
            data[pixelIndex + 2] = val;
            data[pixelIndex + 3] = 255;
        }
    };
    generateRow(grading.curves.l, 0);
    generateRow(grading.curves.r, 1);
    generateRow(grading.curves.g, 2);
    generateRow(grading.curves.b, 3);
    curvesTextureRef.current.image.data = data;
    curvesTextureRef.current.needsUpdate = true;
    if (materialRef.current) materialRef.current.uniforms.tCurves.value = curvesTextureRef.current;
  }, [grading.curves]);

  // Update Uniforms
  useEffect(() => {
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.exposure.value = grading.exposure;
      u.contrast.value = grading.contrast;
      u.highlights.value = grading.highlights;
      u.shadows.value = grading.shadows;
      u.whites.value = grading.whites;
      u.blacks.value = grading.blacks;
      u.saturation.value = grading.saturation;
      u.vibrance.value = grading.vibrance;
      u.brightness.value = grading.brightness;
      u.temperature.value = grading.temperature;
      u.tint.value = grading.tint;

      u.textureAmount.value = grading.texture || 0;
      u.clarity.value = grading.clarity || 0;
      u.dehaze.value = grading.dehaze || 0;

      u.vignette.value = grading.vignette;
      u.vignetteMidpoint.value = grading.vignetteMidpoint;
      u.vignetteRoundness.value = grading.vignetteRoundness;
      u.vignetteFeather.value = grading.vignetteFeather;
      u.distortion.value = grading.distortion || 0;
      u.chromaticAberration.value = grading.chromaticAberration || 0;

      u.grain.value = grading.grain;
      u.grainSize.value = grading.grainSize;
      u.grainRoughness.value = grading.grainRoughness;
      u.sharpness.value = grading.sharpness;
      u.lutIntensity.value = grading.lutIntensity;
      u.halation.value = grading.halation || 0;
      
      let mode = 0.0;
      if (grading.toneMapping === 'filmic') mode = 1.0;
      if (grading.toneMapping === 'agx') mode = 2.0;
      if (grading.toneMapping === 'soft') mode = 3.0;
      if (grading.toneMapping === 'neutral') mode = 4.0;
      u.toneMapping.value = mode;
      u.toneStrength.value = grading.toneStrength;

      let compMode = 0;
      if (grading.comparisonMode === 'split') compMode = 1;
      if (grading.comparisonMode === 'toggle') compMode = 2; // Bypass
      u.comparisonMode.value = compMode;
      u.splitPosition.value = grading.splitPosition;

      // Color Mixer Array
      const mixerArr = MIXER_ORDER.map(key => {
          const ch = grading.colorMixer[key as keyof typeof grading.colorMixer];
          return new THREE.Vector3(
              ch.hue / 360.0, 
              ch.saturation / 100.0, 
              ch.luminance / 100.0   
          );
      });
      u.cmOffsets.value = mixerArr;

      // Calibration
      if (grading.calibration) {
          u.calibRed.value.set(grading.calibration.red.hue, grading.calibration.red.saturation / 100.0);
          u.calibGreen.value.set(grading.calibration.green.hue, grading.calibration.green.saturation / 100.0);
          u.calibBlue.value.set(grading.calibration.blue.hue, grading.calibration.blue.saturation / 100.0);
          u.calibShadowTint.value = grading.calibration.shadowTint;
      }

      const cg = grading.colorGrading;
      u.cgShadowsColor.value = getTintVector(cg.shadows.hue, cg.shadows.saturation);
      u.cgMidtonesColor.value = getTintVector(cg.midtones.hue, cg.midtones.saturation);
      u.cgHighlightsColor.value = getTintVector(cg.highlights.hue, cg.highlights.saturation);
      u.cgLumaParams.value.set(cg.shadows.luminance, cg.midtones.luminance, cg.highlights.luminance);
      u.cgBlending.value = cg.blending / 100;
      u.cgBalance.value = cg.balance / 100;
    }
  }, [grading]);

  // Fit to screen Logic
  const fitToScreen = useCallback(() => {
    if (!mountRef.current || !media.width || !media.height) return;
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [media.width, media.height]);

  useEffect(() => {
    fitToScreen();
  }, [fitSignal, media.width, media.height]);


  // Layout & Resize Logic + Apply Transform
  useEffect(() => {
     const handleLayoutUpdate = () => {
        if (!mountRef.current || !rendererRef.current || !materialRef.current || !meshRef.current) return;
        
        const { width, height } = mountRef.current.getBoundingClientRect();
        rendererRef.current.setSize(width, height);
        materialRef.current.uniforms.resolution.value.set(width, height);

        if (media.width && media.height && width > 0 && height > 0) {
            const aspect = media.width / media.height;
            const containerAspect = width / height;
            
            if (cameraRef.current) {
               cameraRef.current.left = -containerAspect;
               cameraRef.current.right = containerAspect;
               cameraRef.current.top = 1;
               cameraRef.current.bottom = -1;
               cameraRef.current.updateProjectionMatrix();
            }

            let fitScale = 1;
            if (aspect > containerAspect) {
                 fitScale = containerAspect / aspect;
            } else {
                fitScale = 1;
            }
            
            meshRef.current.scale.set(
                aspect * fitScale * transform.scale, 
                fitScale * transform.scale, 
                1
            );
            
            const worldPanX = (transform.x / height) * 2;
            const worldPanY = -(transform.y / height) * 2;

            meshRef.current.position.set(
                worldPanX, 
                worldPanY, 
                0
            );
        }
     };

     handleLayoutUpdate();
     window.requestAnimationFrame(handleLayoutUpdate);
  }, [media.width, media.height, transform]);

  // Media Loading
  useEffect(() => {
    if (!media.url || !materialRef.current) return;
    if (media.type === 'image') {
       new THREE.TextureLoader().load(media.url, (tex) => {
         tex.minFilter = THREE.LinearFilter;
         tex.magFilter = THREE.LinearFilter;
         tex.generateMipmaps = false;
         textureRef.current = tex;
         materialRef.current!.uniforms.tDiffuse.value = tex;
         onMediaLoaded({ width: tex.image.width, height: tex.image.height });
       });
    } else if (media.type === 'video') {
       const video = document.createElement('video');
       video.src = media.url;
       video.loop = true;
       video.muted = true;
       video.crossOrigin = 'anonymous';
       video.playsInline = true;
       video.load();
       video.addEventListener('loadedmetadata', () => {
          onMediaLoaded({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
       });
       videoElementRef.current = video;
       const videoTex = new THREE.VideoTexture(video);
       videoTex.minFilter = THREE.LinearFilter;
       videoTex.magFilter = THREE.LinearFilter;
       videoTex.generateMipmaps = false;
       textureRef.current = videoTex;
       materialRef.current.uniforms.tDiffuse.value = videoTex;
    }
    return () => {
        if (videoElementRef.current) {
            videoElementRef.current.pause();
            videoElementRef.current.src = "";
            videoElementRef.current = null;
        }
    }
  }, [media.url, media.type]);

  useEffect(() => {
    if (videoElementRef.current) {
        if (isPlaying) videoElementRef.current.play();
        else videoElementRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (videoElementRef.current && seekTime !== null) {
        videoElementRef.current.currentTime = seekTime;
    }
  }, [seekTime]);


  // Event Handlers for Zoom/Pan
  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.05;
      const direction = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
      setTransform(prev => ({
          ...prev,
          scale: Math.max(0.1, Math.min(10, prev.scale * direction))
      }));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      setTransform(prev => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy
      }));
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      isDraggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
  };


  return (
    <div 
        className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden group cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
    >
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{ 
                 backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                 backgroundSize: '40px 40px',
                 transform: `translate(${transform.x}px, ${transform.y}px)`
             }} 
        />
        <div ref={mountRef} className="w-full h-full z-10 relative pointer-events-none" />
        
        {/* Waveform Overlay Toggle & Container */}
        {media.url && (
            <div className="absolute top-4 left-4 z-30 pointer-events-auto flex flex-col gap-2">
                 <button 
                     onClick={() => setShowScope(!showScope)}
                     className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showScope ? 'bg-blue-600 text-white' : 'bg-black/60 text-zinc-400 hover:text-white border border-white/10'}`}
                     title="Toggle Waveform Scope"
                     onPointerDown={(e) => e.stopPropagation()} 
                 >
                     <Icon component={ChartLine} size={16} weight="bold" />
                 </button>

                 {showScope && (
                     <div 
                        className="w-[280px] h-[180px] bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                        onPointerDown={(e) => e.stopPropagation()} 
                     >
                         <WaveformMonitor 
                            grading={grading} 
                            media={media} 
                            isPlaying={isPlaying} 
                            transparent 
                            className="w-full h-full"
                         />
                     </div>
                 )}
            </div>
        )}

        {!media.url && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-zinc-500 pointer-events-none">
                <span className="font-['Bebas_Neue'] text-4xl tracking-widest opacity-50">No Signal</span>
                <span className="font-mono text-xs mt-2">Open Media to begin grading</span>
            </div>
        )}
    </div>
  );
};

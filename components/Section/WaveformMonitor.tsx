
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GradingParams, MediaState, CurvePoint } from '../../types';
import { GRADING_UTILS } from '../../constants';
import { MonotoneCubicSpline } from '../../spline';
import { Icon } from '../Core/Icon';
import { Clock, Target, User, Crosshair } from '@phosphor-icons/react';
import { Tooltip } from '../Core/Tooltip';

interface WaveformMonitorProps {
  grading: GradingParams;
  media: MediaState;
  isPlaying: boolean;
  className?: string;
  transparent?: boolean;
}

type WaveMode = 'luma' | 'rgb' | 'r' | 'g' | 'b' | 'vector';

// Force high precision for texture lookups in Vertex Shader
const WAVE_VERTEX_SHADER = `
precision highp float;
precision highp sampler3D;

uniform sampler2D tDiffuse;
uniform sampler2D tCurves;
uniform vec2 resolution;
uniform int mode; // 0=Luma, 1=RGB, 2=R, 3=G, 4=B, 5=Vectorscope

attribute float vertexIndex;

varying vec3 vColor;

${GRADING_UTILS}

vec3 rgb2yuv(vec3 rgb) {
    float y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    float u = 0.492 * (rgb.b - y);
    float v = 0.877 * (rgb.r - y);
    return vec3(y, u, v);
}

void main() {
    float width = 512.0;
    float height = 512.0;
    
    float x = mod(vertexIndex, width);
    float y = floor(vertexIndex / width);
    
    vec2 uv = vec2((x + 0.5) / width, (y + 0.5) / height);
    
    // For Waveform, we sample the center of the pixel
    vec4 tex = texture2D(tDiffuse, uv);
    
    // Apply grading pipeline
    vec3 color = calculateFinalColor(tex.rgb, uv, resolution, tCurves, tDiffuse);
    
    vec3 pos = vec3(0.0);
    vec3 outputColor = vec3(1.0);
    float pointSize = 1.5;

    if (mode == 5) {
        // VECTORSCOPE
        // Convert to YUV (or similar chroma space)
        vec3 yuv = rgb2yuv(color);
        // Map U to X, V to Y. Range usually -0.5 to 0.5. Map to -1 to 1.
        float u = yuv.y; 
        float v = yuv.z;
        
        // Boost spread for visibility
        pos.x = u * 2.0; 
        pos.y = v * 2.0; 
        
        // Color the point by its actual color
        outputColor = color;
        pointSize = 1.0;
        
    } else {
        // WAVEFORMS
        float yPos = 0.0;
        
        if (mode == 0) { // Luma
            yPos = getLuminance(color);
            outputColor = vec3(1.0);
        } 
        else if (mode == 2) { // Red
            yPos = color.r;
            outputColor = vec3(1.0, 0.3, 0.3);
        }
        else if (mode == 3) { // Green
            yPos = color.g;
            outputColor = vec3(0.3, 1.0, 0.3);
        }
        else if (mode == 4) { // Blue
            yPos = color.b;
            outputColor = vec3(0.3, 0.5, 1.0);
        }
        else if (mode == 1) { // RGB Parade
            float m = mod(vertexIndex, 3.0);
            if (m < 0.5) {
                 yPos = color.r;
                 outputColor = vec3(1.0, 0.0, 0.0);
            } else if (m < 1.5) {
                 yPos = color.g;
                 outputColor = vec3(0.0, 1.0, 0.0);
            } else {
                 yPos = color.b;
                 outputColor = vec3(0.0, 0.0, 1.0);
            }
        }
        // Waveform Position Mapping
        pos = vec3(uv.x * 2.0 - 1.0, yPos * 2.0 - 1.0, 0.0);
    }
    
    vColor = outputColor;
    gl_Position = vec4(pos, 1.0);
    gl_PointSize = pointSize;
}
`;

const WAVE_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vColor;

void main() {
    gl_FragColor = vec4(vColor, 0.15); // Lower opacity for better accumulation
}
`;

// Helper: HSL to RGB Vector3
function getTintVector(hue: number, sat: number) {
    const h = hue;
    const s = sat;
    const l = 0.5;

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
    
    return new THREE.Vector3(r + m - 0.5, g + m - 0.5, b + m - 0.5);
}

// Order MUST match shader: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta
const MIXER_ORDER = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

// Calculates the vectorscope position for a given RGB value (matching the shader)
const getVectorPos = (r: number, g: number, b: number) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const u = 0.492 * (b - y);
    const v = 0.877 * (r - y);
    // Shader scales by 2.0
    return { x: u * 2.0, y: v * 2.0 };
};

export const WaveformMonitor: React.FC<WaveformMonitorProps> = ({ 
    grading, media, isPlaying, className, transparent 
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const curvesTextureRef = useRef<THREE.DataTexture | null>(null);
  const requestRef = useRef<number>(0);
  
  const [mode, setMode] = useState<WaveMode>('luma');
  // 0 = Off, 1 = Short, 2 = Long
  const [persistenceMode, setPersistenceMode] = useState<0 | 1 | 2>(0); 
  const [showTargets, setShowTargets] = useState(true);
  const [showSkinLine, setShowSkinLine] = useState(true);
  const [showGraticule, setShowGraticule] = useState(true);

  const persistenceRef = useRef<0 | 1 | 2>(0);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const graticuleGroupRef = useRef<THREE.Group | null>(null);
  const targetsGroupRef = useRef<THREE.Group | null>(null);
  const skinLineGroupRef = useRef<THREE.Group | null>(null);
  const baseGraticuleRef = useRef<THREE.Group | null>(null);

  // Sync state to ref for animation loop
  useEffect(() => {
    persistenceRef.current = persistenceMode;
    if (fadeMaterialRef.current) {
        // Short (1) = High opacity (fast fade)
        // Long (2) = Low opacity (slow fade)
        fadeMaterialRef.current.opacity = persistenceMode === 1 ? 0.3 : 0.08;
    }
  }, [persistenceMode]);

  // Sync Vectorscope options
  useEffect(() => {
      if (targetsGroupRef.current) targetsGroupRef.current.visible = showTargets;
      if (skinLineGroupRef.current) skinLineGroupRef.current.visible = showSkinLine;
      if (baseGraticuleRef.current) baseGraticuleRef.current.visible = showGraticule;
  }, [showTargets, showSkinLine, showGraticule]);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;
    
    if (mountRef.current.hasChildNodes()) {
        mountRef.current.innerHTML = '';
    }

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    // --- Persistence (Trails) Setup ---
    const fadeGeo = new THREE.PlaneGeometry(2, 2);
    const fadeMat = new THREE.MeshBasicMaterial({
        color: 0x000000, 
        transparent: true, 
        opacity: 0.2,
        depthTest: false,
        depthWrite: false
    });
    fadeMaterialRef.current = fadeMat;
    const fadePlane = new THREE.Mesh(fadeGeo, fadeMat);
    fadePlane.renderOrder = -1;
    fadePlane.visible = false;
    scene.add(fadePlane);

    // --- Vectorscope Graticule Group ---
    const mainGraticuleGroup = new THREE.Group();
    mainGraticuleGroup.visible = false;
    graticuleGroupRef.current = mainGraticuleGroup;
    scene.add(mainGraticuleGroup);

    // Sub-Groups
    const baseGroup = new THREE.Group();
    const targetsGroup = new THREE.Group();
    const skinLineGroup = new THREE.Group();
    
    baseGraticuleRef.current = baseGroup;
    targetsGroupRef.current = targetsGroup;
    skinLineGroupRef.current = skinLineGroup;

    mainGraticuleGroup.add(baseGroup);
    mainGraticuleGroup.add(targetsGroup);
    mainGraticuleGroup.add(skinLineGroup);

    // 1. Base Graticule (Circle + Crosshair)
    // Circle
    const circleCurve = new THREE.EllipseCurve(0, 0, 0.7, 0.7, 0, 2 * Math.PI, false, 0);
    const circlePoints = circleCurve.getPoints(64);
    const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const circleMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    baseGroup.add(new THREE.Line(circleGeo, circleMat));

    // Crosshair
    const crossPoints = [
        new THREE.Vector2(-0.05, 0), new THREE.Vector2(0.05, 0),
        new THREE.Vector2(0, -0.05), new THREE.Vector2(0, 0.05)
    ];
    const crossGeo = new THREE.BufferGeometry().setFromPoints(crossPoints);
    const crossMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    baseGroup.add(new THREE.LineSegments(crossGeo, crossMat));

    // 2. Targets (75% Saturation)
    const targets = [
        { r: 1, g: 0, b: 0, color: 0xff4444 }, // Red
        { r: 1, g: 0, b: 1, color: 0xff44ff }, // Magenta
        { r: 0, g: 0, b: 1, color: 0x4444ff }, // Blue
        { r: 0, g: 1, b: 1, color: 0x44ffff }, // Cyan
        { r: 0, g: 1, b: 0, color: 0x44ff44 }, // Green
        { r: 1, g: 1, b: 0, color: 0xffff44 }, // Yellow
    ];

    targets.forEach(t => {
        const pos = getVectorPos(t.r * 0.75, t.g * 0.75, t.b * 0.75);
        const boxSize = 0.04;
        const boxPoints = [
            new THREE.Vector2(pos.x - boxSize, pos.y - boxSize), new THREE.Vector2(pos.x + boxSize, pos.y - boxSize),
            new THREE.Vector2(pos.x + boxSize, pos.y - boxSize), new THREE.Vector2(pos.x + boxSize, pos.y + boxSize),
            new THREE.Vector2(pos.x + boxSize, pos.y + boxSize), new THREE.Vector2(pos.x - boxSize, pos.y + boxSize),
            new THREE.Vector2(pos.x - boxSize, pos.y + boxSize), new THREE.Vector2(pos.x - boxSize, pos.y - boxSize),
        ];
        const boxGeo = new THREE.BufferGeometry().setFromPoints(boxPoints);
        const boxMat = new THREE.LineBasicMaterial({ color: t.color, transparent: true, opacity: 0.6 });
        targetsGroup.add(new THREE.LineSegments(boxGeo, boxMat));
        
        const dotGeo = new THREE.PlaneGeometry(0.015, 0.015);
        const dotMat = new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.8 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(pos.x, pos.y, 0);
        targetsGroup.add(dot);
    });

    // 3. Skin Tone Line (I-Axis approximation)
    const skinGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(-0.4, 0.6) 
    ]);
    const skinMat = new THREE.LineDashedMaterial({ 
        color: 0xffccaa, 
        transparent: true, 
        opacity: 0.5,
        dashSize: 0.05,
        gapSize: 0.03,
        scale: 1
    });
    const skinLine = new THREE.Line(skinGeo, skinMat);
    skinLine.computeLineDistances();
    skinLineGroup.add(skinLine);

    // --- Points Setup ---
    const res = 512;
    const count = res * res;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(count * 3);
    const indices = new Float32Array(count);
    
    for(let i=0; i<count; i++) {
        indices[i] = i;
        positions[i*3] = 0; positions[i*3+1] = 0; positions[i*3+2] = 0;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('vertexIndex', new THREE.BufferAttribute(indices, 1));

    // Textures
    const placeholderTex = new THREE.DataTexture(new Uint8Array([0,0,0,255]), 1, 1);
    placeholderTex.needsUpdate = true;
    
    const curvesData = new Uint8Array(256 * 4 * 4);
    const curvesTex = new THREE.DataTexture(curvesData, 256, 4);
    curvesTex.format = THREE.RGBAFormat;
    curvesTex.minFilter = THREE.LinearFilter;
    curvesTex.magFilter = THREE.LinearFilter;
    curvesTex.needsUpdate = true;
    curvesTextureRef.current = curvesTex;

    // Dummy LUT 3D Texture for shader compatibility
    const dummyLutData = new Float32Array(2*2*2*4).fill(1);
    const dummyLut = new THREE.Data3DTexture(dummyLutData, 2, 2, 2);
    dummyLut.needsUpdate = true;

    // Initialize Mixer Array
    const mixerArr = new Array(8).fill(new THREE.Vector3(0,0,0));

    const material = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: placeholderTex },
            tCurves: { value: curvesTex },
            tLut: { value: dummyLut }, // Dummy
            hasLut: { value: 0 },
            lutIntensity: { value: 0 },
            lutSize: { value: 2 },
            resolution: { value: new THREE.Vector2(width, height) },
            mode: { value: 0 },
            exposure: { value: 0 }, contrast: { value: 1 },
            highlights: { value: 0 }, shadows: { value: 0 }, whites: { value: 0 }, blacks: { value: 0 },
            saturation: { value: 1 }, vibrance: { value: 0 }, brightness: { value: 0 },
            temperature: { value: 0 }, tint: { value: 0 },
            vignette: { value: 0 }, vignetteMidpoint: { value: 0.5 }, vignetteRoundness: { value: 0 }, vignetteFeather: { value: 0.5 },
            grain: { value: 0 }, grainSize: { value: 1.0 }, grainRoughness: { value: 0.5 },
            halation: { value: 0 },
            sharpness: { value: 0 }, toneMapping: { value: 0 },
            toneStrength: { value: 1 },
            cgShadowsColor: { value: new THREE.Vector3(0,0,0) },
            cgMidtonesColor: { value: new THREE.Vector3(0,0,0) },
            cgHighlightsColor: { value: new THREE.Vector3(0,0,0) },
            cgLumaParams: { value: new THREE.Vector3(0,0,0) },
            cgBlending: { value: 0.5 }, cgBalance: { value: 0 },
            cmOffsets: { value: mixerArr }
        },
        vertexShader: WAVE_VERTEX_SHADER,
        fragmentShader: WAVE_FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    materialRef.current = material;

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; 
    points.renderOrder = 1;
    scene.add(points);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const animate = () => {
        requestRef.current = requestAnimationFrame(animate);
        
        if (media.type === 'video' && videoElementRef.current && textureRef.current) {
            if (videoElementRef.current.readyState >= videoElementRef.current.HAVE_CURRENT_DATA) {
                textureRef.current.needsUpdate = true;
            }
        }
        
        // Trail Logic
        if (persistenceRef.current > 0) {
            renderer.autoClear = false;
            fadePlane.visible = true;
        } else {
            renderer.autoClear = true;
            fadePlane.visible = false;
        }

        // Toggle vectorscope graticule parent visibility
        if (graticuleGroupRef.current) {
            graticuleGroupRef.current.visible = (mode === 'vector');
        }

        renderer.render(scene, camera);
    };
    animate();

    return () => {
        cancelAnimationFrame(requestRef.current);
        if (mountRef.current && rendererRef.current) {
            mountRef.current.removeChild(rendererRef.current.domElement);
        }
        renderer.dispose();
        geometry.dispose();
        material.dispose();
        dummyLut.dispose();
    };
  }, []);

  // Update Media
  useEffect(() => {
      if (!media.url || !materialRef.current) return;
      if (videoElementRef.current) {
          videoElementRef.current.pause();
          videoElementRef.current.src = "";
          videoElementRef.current = null;
      }

      if (media.type === 'image') {
           new THREE.TextureLoader().load(media.url, (tex) => {
               tex.minFilter = THREE.LinearFilter;
               tex.magFilter = THREE.LinearFilter;
               tex.generateMipmaps = false;
               textureRef.current = tex;
               materialRef.current!.uniforms.tDiffuse.value = tex;
           });
      } else if (media.type === 'video') {
           const video = document.createElement('video');
           video.src = media.url;
           video.loop = true;
           video.muted = true;
           video.crossOrigin = 'anonymous';
           video.playsInline = true;
           video.load();
           videoElementRef.current = video;
           
           const vidTex = new THREE.VideoTexture(video);
           vidTex.minFilter = THREE.LinearFilter;
           vidTex.magFilter = THREE.LinearFilter;
           vidTex.generateMipmaps = false;
           textureRef.current = vidTex;
           materialRef.current.uniforms.tDiffuse.value = vidTex;

           if (isPlaying) video.play();
      }
  }, [media.url, media.type]);

  // Sync Playback
  useEffect(() => {
      if (videoElementRef.current) {
          if (isPlaying) videoElementRef.current.play();
          else videoElementRef.current.pause();
      }
  }, [isPlaying]);

  // Sync Grading Parameters
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
      u.vignette.value = grading.vignette;
      u.vignetteMidpoint.value = grading.vignetteMidpoint;
      u.vignetteRoundness.value = grading.vignetteRoundness;
      u.vignetteFeather.value = grading.vignetteFeather;
      u.grain.value = grading.grain;
      u.grainSize.value = grading.grainSize;
      u.grainRoughness.value = grading.grainRoughness;
      u.halation.value = grading.halation || 0;
      
      let tone = 0.0;
      if (grading.toneMapping === 'filmic') tone = 1.0;
      if (grading.toneMapping === 'agx') tone = 2.0;
      if (grading.toneMapping === 'soft') tone = 3.0;
      if (grading.toneMapping === 'neutral') tone = 4.0;
      u.toneMapping.value = tone;
      u.toneStrength.value = grading.toneStrength;

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

      const cg = grading.colorGrading;
      u.cgShadowsColor.value = getTintVector(cg.shadows.hue, cg.shadows.saturation);
      u.cgMidtonesColor.value = getTintVector(cg.midtones.hue, cg.midtones.saturation);
      u.cgHighlightsColor.value = getTintVector(cg.highlights.hue, cg.highlights.saturation);
      u.cgLumaParams.value.set(cg.shadows.luminance, cg.midtones.luminance, cg.highlights.luminance);
      u.cgBlending.value = cg.blending / 100;
      u.cgBalance.value = cg.balance / 100;

      let m = 0;
      if (mode === 'rgb') m = 1;
      if (mode === 'r') m = 2;
      if (mode === 'g') m = 3;
      if (mode === 'b') m = 4;
      if (mode === 'vector') m = 5;
      u.mode.value = m;
    }
  }, [grading, mode]);

  // Sync Curves
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
  }, [grading.curves]);

  const Tab = ({ id, label }: { id: WaveMode, label: string }) => (
      <button 
        onClick={() => setMode(id)}
        className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${mode === id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        {label}
      </button>
  );

  const getPersistenceLabel = () => {
    switch(persistenceMode) {
        case 1: return "Short Trail";
        case 2: return "Long Trail";
        default: return "Persistence Off";
    }
  };

  const handlePersistenceToggle = () => {
      // Cycle: 0 -> 1 -> 2 -> 0
      setPersistenceMode((prev) => (prev + 1) % 3 as 0 | 1 | 2);
  };

  return (
    <div className={className || "w-full h-48 bg-[#09090b] border-b border-white/5 flex flex-col relative shrink-0"}>
        <div className="absolute top-2 left-2 flex items-center gap-2 z-10">
            <div className="flex gap-1">
                <Tab id="luma" label="L" />
                <Tab id="rgb" label="RGB" />
                <Tab id="vector" label="Vec" />
            </div>
            
            <div className="w-px h-3 bg-white/10 mx-1" />
            
            <Tooltip content={getPersistenceLabel()}>
                <button
                    onClick={handlePersistenceToggle}
                    className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${persistenceMode > 0 ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                >
                    <Icon component={Clock} size={12} weight={persistenceMode > 0 ? 'fill' : 'bold'} />
                    {persistenceMode > 0 && (
                         <span className="absolute bottom-[2px] right-[2px] w-1 h-1 bg-white rounded-full"></span>
                    )}
                </button>
            </Tooltip>

            {mode === 'vector' && (
                <>
                    <div className="w-px h-3 bg-white/10 mx-1 animate-in fade-in" />
                    
                    <Tooltip content="Graticule">
                        <button
                            onClick={() => setShowGraticule(!showGraticule)}
                            className={`w-5 h-5 flex items-center justify-center rounded transition-colors animate-in fade-in ${showGraticule ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                        >
                            <Icon component={Crosshair} size={12} weight="bold" />
                        </button>
                    </Tooltip>

                    <Tooltip content="Targets">
                        <button
                            onClick={() => setShowTargets(!showTargets)}
                            className={`w-5 h-5 flex items-center justify-center rounded transition-colors animate-in fade-in ${showTargets ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                        >
                            <Icon component={Target} size={12} weight="bold" />
                        </button>
                    </Tooltip>

                    <Tooltip content="Skin Tone Line">
                        <button
                            onClick={() => setShowSkinLine(!showSkinLine)}
                            className={`w-5 h-5 flex items-center justify-center rounded transition-colors animate-in fade-in ${showSkinLine ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                        >
                            <Icon component={User} size={12} weight="bold" />
                        </button>
                    </Tooltip>
                </>
            )}
        </div>
        
        {!transparent && (
            <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-col justify-between p-4 z-0">
                <div className="w-full h-px bg-white/50" />
                <div className="w-full h-px bg-white/20" />
                <div className="w-full h-px bg-white/20" />
                <div className="w-full h-px bg-white/50" />
            </div>
        )}

        <div ref={mountRef} className="w-full h-full z-0" />
    </div>
  );
};

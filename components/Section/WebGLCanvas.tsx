
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GradingParams, MediaState, CurvePoint, ToolType, WebGLCanvasRef } from '../../types';
import { FRAGMENT_SHADER, VERTEX_SHADER } from '../../constants';
import { MonotoneCubicSpline } from '../../spline';
import { WaveformMonitor } from './WaveformMonitor';
import { Icon } from '../Core/Icon';
import { ChartLine, ArrowsLeftRight } from '@phosphor-icons/react';
import { parseCubeLUT } from '../../lutParser';
import { getPrePointColor, rgb2hsl } from '../../lutEngine';

interface WebGLCanvasProps {
  grading: GradingParams;
  media: MediaState;
  onMediaLoaded: (media: Partial<MediaState>) => void;
  isPlaying: boolean;
  seekTime: number | null;
  fitSignal?: number;
  activeTool: ToolType;
  onSamplePointColor: (hue: number, sat: number, lum: number) => void;
  onUpdateSplitPosition?: (pos: number) => void;
  onTimeUpdate?: (time: number) => void;
}

function getTintVector(hue: number, sat: number) {
    const h = hue;
    const s = sat;
    const l = 0.5;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number, k = (n + h / 30) % 12) => l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    const r = f(0);
    const g = f(8);
    const b = f(4);
    return new THREE.Vector3(r - 0.5, g - 0.5, b - 0.5);
}

const MIXER_ORDER = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

export const WebGLCanvas = forwardRef<WebGLCanvasRef, WebGLCanvasProps>(({ 
    grading, media, onMediaLoaded, isPlaying, seekTime, fitSignal, 
    activeTool, onSamplePointColor, onUpdateSplitPosition, onTimeUpdate
}, ref) => {
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
  
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const isDraggingSplitRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [showScope, setShowScope] = useState(false);

  const raycasterRef = useRef(new THREE.Raycaster());

  // Maintain latest ref for callback
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  // --- Export Methods ---
  useImperativeHandle(ref, () => ({
      exportImage: (filename: string) => {
          if (!mountRef.current || !rendererRef.current) return;
          const canvas = mountRef.current.querySelector('canvas');
          if (!canvas) {
              alert('Export failed: Canvas not found');
              return;
          }

          // Force a render to ensure the buffer is fresh
          if (sceneRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
          }

          try {
              const url = canvas.toDataURL('image/png', 1.0);
              const link = document.createElement('a');
              link.href = url;
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          } catch (e) {
              console.error(e);
              alert('Export failed. Security error (Tainted Canvas). Ensure media is CORS enabled.');
          }
      },
      exportVideo: async (filename: string, onProgress: (p: number) => void, onComplete: () => void) => {
          if (!mountRef.current || !videoElementRef.current) {
              alert('No video loaded');
              onComplete();
              return;
          }
          const canvas = mountRef.current.querySelector('canvas');
          if (!canvas) {
              onComplete();
              return;
          }

          const video = videoElementRef.current;
          const wasPlaying = !video.paused;
          
          video.pause();
          video.currentTime = 0;
          video.volume = 1.0;
          video.muted = false;

          // MIME Type Check
          let mimeType = '';
          const types = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm', 'video/mp4'];
          for (const t of types) {
              if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
          }

          if (!mimeType) {
              alert('Browser does not support video recording.');
              onComplete();
              return;
          }

          const canvasStream = canvas.captureStream(30); 
          let finalStream = canvasStream;
          
          // Audio
          let audioTracks: MediaStreamTrack[] = [];
          // @ts-ignore
          if (video.captureStream || video.mozCaptureStream) {
              // @ts-ignore
              const vidStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
              audioTracks = vidStream.getAudioTracks();
              if (audioTracks.length > 0) {
                  finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
              }
          }

          const recorder = new MediaRecorder(finalStream, {
              mimeType,
              videoBitsPerSecond: 8000000 
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType });
              let safeName = filename;
              if (mimeType.includes('mp4') && safeName.endsWith('.webm')) {
                  safeName = safeName.replace('.webm', '.mp4');
              }
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = safeName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              
              finalStream.getTracks().forEach(t => t.stop());
              
              video.currentTime = 0;
              if (wasPlaying) video.play();
              onComplete();
          };

          recorder.start();
          try {
              await video.play();
          } catch(e) {
              console.error(e);
              recorder.stop();
              onComplete();
              return;
          }

          const checkProgress = () => {
              if (!videoElementRef.current) return;
              if (video.ended || video.currentTime >= video.duration) {
                  if (recorder.state !== 'inactive') recorder.stop();
              } else {
                  onProgress(video.currentTime / video.duration);
                  requestAnimationFrame(checkProgress);
              }
          };
          checkProgress();
      }
  }));

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
    
    const dummyLutData = new Float32Array(2*2*2*4).fill(1);
    const dummyLut = new THREE.Data3DTexture(dummyLutData, 2, 2, 2);
    dummyLut.needsUpdate = true;
    lutTextureRef.current = dummyLut;
    
    const mixerArr = new Array(8).fill(new THREE.Vector3(0,0,0));
    
    // Initial arrays for Point Color
    const pointArr = new Array(8).fill(new THREE.Vector3(0,0,0));
    const floatArr = new Array(8).fill(0.0);

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
        
        // Detail Params
        denoise: { value: 0 },
        sharpenAmount: { value: 0 },
        sharpenRadius: { value: 1.0 },
        sharpenMasking: { value: 0 },

        vignette: { value: 0 },
        vignetteMidpoint: { value: 0.5 },
        vignetteRoundness: { value: 0 },
        vignetteFeather: { value: 0.5 },
        distortion: { value: 0 },
        distortionCrop: { value: 0 },
        chromaticAberration: { value: 0 },
        
        // Defringe
        defringePurpleAmount: { value: 0 },
        defringePurpleHueOffset: { value: 0 },
        defringeGreenAmount: { value: 0 },
        defringeGreenHueOffset: { value: 0 },

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
        
        // Point Color Arrays
        pcSources: { value: pointArr },
        pcShifts: { value: pointArr },
        pcRanges: { value: pointArr },
        pcFalloffs: { value: pointArr },
        pcActives: { value: floatArr },
        pcCount: { value: 0 },
        pcShowMask: { value: 0 },
        pcMaskIndex: { value: -1 },

        resolution: { value: new THREE.Vector2(width, height) },
        comparisonMode: { value: 0 },
        splitPosition: { value: 0.5 },
        falseColor: { value: 0 }
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
      
      // Check videoElementRef directly instead of stale media closure
      if (videoElementRef.current && textureRef.current) {
        if (videoElementRef.current.readyState >= videoElementRef.current.HAVE_CURRENT_DATA) {
          textureRef.current.needsUpdate = true;
        }
        // Use ref for callback to ensure we use the latest function
        if (onTimeUpdateRef.current) {
            onTimeUpdateRef.current(videoElementRef.current.currentTime);
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
        if (!points) return;
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
      
      const detail = grading.detail || { denoise: 0, sharpening: { amount: 0, radius: 1, detail: 0, masking: 0 } };
      u.denoise.value = detail.denoise;
      u.sharpenAmount.value = detail.sharpening.amount;
      u.sharpenRadius.value = detail.sharpening.radius;
      u.sharpenMasking.value = detail.sharpening.masking;

      u.vignette.value = grading.vignette;
      u.vignetteMidpoint.value = grading.vignetteMidpoint;
      u.vignetteRoundness.value = grading.vignetteRoundness;
      u.vignetteFeather.value = grading.vignetteFeather;
      u.distortion.value = grading.distortion || 0;
      u.distortionCrop.value = grading.distortionCrop ? 1.0 : 0.0;
      u.chromaticAberration.value = grading.chromaticAberration || 0;
      
      const def = grading.defringe || { purpleAmount: 0, purpleHueOffset: 0, greenAmount: 0, greenHueOffset: 0 };
      u.defringePurpleAmount.value = def.purpleAmount;
      u.defringePurpleHueOffset.value = def.purpleHueOffset;
      u.defringeGreenAmount.value = def.greenAmount;
      u.defringeGreenHueOffset.value = def.greenHueOffset;

      u.grain.value = grading.grain;
      u.grainSize.value = grading.grainSize;
      u.grainRoughness.value = grading.grainRoughness;
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
      if (grading.comparisonMode === 'toggle') compMode = 2;
      u.comparisonMode.value = compMode;
      u.splitPosition.value = grading.splitPosition;
      u.falseColor.value = grading.falseColor ? 1.0 : 0.0;

      const mixerArr = MIXER_ORDER.map(key => {
          const ch = grading.colorMixer[key as keyof typeof grading.colorMixer];
          return new THREE.Vector3(
              ch.hue / 360.0, 
              ch.saturation / 100.0, 
              ch.luminance / 100.0   
          );
      });
      u.cmOffsets.value = mixerArr;
      
      if (grading.pointColor && Array.isArray(grading.pointColor.points)) {
          const points = grading.pointColor.points;
          
          const pcSources = new Array(8).fill(new THREE.Vector3(0,0,0));
          const pcShifts = new Array(8).fill(new THREE.Vector3(0,0,0));
          const pcRanges = new Array(8).fill(new THREE.Vector3(0,0,0));
          const pcFalloffs = new Array(8).fill(new THREE.Vector3(0,0,0));
          const pcActives = new Array(8).fill(0.0);

          points.forEach((p, i) => {
              if (i >= 8) return;
              pcSources[i] = new THREE.Vector3(p.srcHue / 360, p.srcSat / 100, p.srcLum / 100);
              pcShifts[i] = new THREE.Vector3(p.hueShift / 360, p.satShift / 100, p.lumShift / 100);
              pcRanges[i] = new THREE.Vector3((p.hueRange || 20) / 360, (p.satRange || 30) / 100, (p.lumRange || 40) / 100);
              pcFalloffs[i] = new THREE.Vector3((p.hueFalloff || 10) / 360, (p.satFalloff || 10) / 100, (p.lumFalloff || 20) / 100);
              pcActives[i] = p.active ? 1.0 : 0.0;
          });

          u.pcSources.value = pcSources;
          u.pcShifts.value = pcShifts;
          u.pcRanges.value = pcRanges;
          u.pcFalloffs.value = pcFalloffs;
          u.pcActives.value = pcActives;
          u.pcCount.value = points.length;
          u.pcShowMask.value = grading.pointColor.showMask ? 1 : 0;
          u.pcMaskIndex.value = grading.pointColor.activePointIndex;
      }

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

  const fitToScreen = useCallback(() => {
    if (!mountRef.current || !media.width || !media.height) return;
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [media.width, media.height]);

  useEffect(() => {
    fitToScreen();
  }, [fitSignal, media.width, media.height]);

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

  useEffect(() => {
    if (!media.url || !materialRef.current) return;
    const offCanvas = document.createElement('canvas');
    sourceCanvasRef.current = offCanvas;

    const handleImageLoad = (img: HTMLImageElement | HTMLVideoElement) => {
        if (img instanceof HTMLImageElement) {
            offCanvas.width = img.width;
            offCanvas.height = img.height;
            offCanvas.getContext('2d')?.drawImage(img, 0, 0);
        }
        if (img instanceof HTMLVideoElement) {
            offCanvas.width = img.videoWidth;
            offCanvas.height = img.videoHeight;
        }
    };

    if (media.type === 'image') {
       const loader = new THREE.TextureLoader();
       loader.setCrossOrigin('anonymous');
       loader.load(media.url, (tex) => {
         tex.minFilter = THREE.LinearFilter;
         tex.magFilter = THREE.LinearFilter;
         tex.generateMipmaps = false;
         textureRef.current = tex;
         materialRef.current!.uniforms.tDiffuse.value = tex;
         onMediaLoaded({ width: tex.image.width, height: tex.image.height });
         handleImageLoad(tex.image);
       });
    } else if (media.type === 'video') {
       const video = document.createElement('video');
       video.src = media.url;
       video.loop = true;
       video.muted = false; // Enabled audio
       video.volume = 1.0;
       video.crossOrigin = 'anonymous';
       video.playsInline = true;
       video.load();
       video.addEventListener('loadedmetadata', () => {
          onMediaLoaded({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
          handleImageLoad(video);
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

  // --- Event Handlers ---

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
      // Split Slider Handling
      if (grading.comparisonMode === 'split') {
          const rect = mountRef.current?.getBoundingClientRect();
          if (rect) {
              const xPos = e.clientX - rect.left;
              const splitX = grading.splitPosition * rect.width;
              if (Math.abs(xPos - splitX) < 15) {
                  isDraggingSplitRef.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  return;
              }
          }
      }

      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect || !meshRef.current || !cameraRef.current) return;

      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
      const intersects = raycasterRef.current.intersectObject(meshRef.current);
      
      // TOOL: Point Picker
      if (activeTool === 'point-picker') {
          if (intersects.length > 0) {
              const uv = intersects[0].uv;
              if (uv && sourceCanvasRef.current) {
                  const ctx = sourceCanvasRef.current.getContext('2d');
                  if (media.type === 'video' && videoElementRef.current) {
                      ctx?.drawImage(videoElementRef.current, 0, 0, sourceCanvasRef.current.width, sourceCanvasRef.current.height);
                  }
                  if (ctx) {
                      const sx = Math.floor(uv.x * sourceCanvasRef.current.width);
                      const sy = Math.floor((1 - uv.y) * sourceCanvasRef.current.height);
                      const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                      const r = pixel[0] / 255;
                      const g = pixel[1] / 255;
                      const b = pixel[2] / 255;
                      const [finalR, finalG, finalB] = getPrePointColor(r, g, b, grading);
                      const linToSrgb = (c: number) => Math.pow(c, 1.0/2.2);
                      const [h, s, l] = rgb2hsl(linToSrgb(finalR), linToSrgb(finalG), linToSrgb(finalB));
                      onSamplePointColor(h, s, l);
                  }
              }
          }
          return; 
      }

      // Default: Pan
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      // Split Dragging
      if (isDraggingSplitRef.current) {
          const rect = mountRef.current?.getBoundingClientRect();
          if (rect && onUpdateSplitPosition) {
              const xPos = e.clientX - rect.left;
              const newSplit = Math.max(0, Math.min(1, xPos / rect.width));
              onUpdateSplitPosition(newSplit);
          }
          return;
      }

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
      isDraggingSplitRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
        className={`w-full h-full bg-black relative flex items-center justify-center overflow-hidden group 
            ${activeTool === 'point-picker' ? 'cursor-crosshair' : ''} 
            ${activeTool === 'move' ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
        
        {/* Split Screen Handle Overlay */}
        {grading.comparisonMode === 'split' && (
            <div 
                className="absolute top-0 bottom-0 z-50 cursor-ew-resize group/split"
                style={{ left: `${grading.splitPosition * 100}%` }}
                onPointerDown={(e) => { 
                    // Let the parent pointerDown handle this capture via hit testing
                }}
            >
                <div className="absolute left-0 top-0 bottom-0 w-px bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/50 flex items-center justify-center opacity-0 group-hover/split:opacity-100 transition-opacity">
                     <Icon component={ArrowsLeftRight} size={16} weight="bold" />
                </div>
            </div>
        )}

        {/* Labels for Split Screen */}
        {grading.comparisonMode === 'split' && (
            <>
                <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest text-zinc-400 z-40 pointer-events-none">
                    Original
                </div>
                <div className="absolute top-4 right-4 bg-black/50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest text-zinc-400 z-40 pointer-events-none">
                    Graded
                </div>
            </>
        )}

        {/* Waveform Overlay Toggle & Container */}
        {media.url && (
            <div className="absolute bottom-4 left-4 z-30 pointer-events-auto flex flex-col gap-2">
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
                        className="w-[280px] h-[180px] bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
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
});

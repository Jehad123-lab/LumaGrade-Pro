
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GradingParams, MediaState, CurvePoint } from '../../types';
import { FRAGMENT_SHADER, VERTEX_SHADER } from '../../constants';
import { MonotoneCubicSpline } from '../../spline';

interface WebGLCanvasProps {
  grading: GradingParams;
  media: MediaState;
  onMediaLoaded: (media: Partial<MediaState>) => void;
  isPlaying: boolean;
  seekTime: number | null;
}

// Helper: HSL to RGB
function hslToRgb(h: number, s: number, l: number) {
    // h in 0-360, s in 0-1, l in 0-1 (we usually use l=0.5 for tint color base)
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

// Helper: Get Tint Vector (Offset from Neutral)
function getTintVector(hue: number, sat: number) {
    const rgb = hslToRgb(hue, sat, 0.5);
    return new THREE.Vector3(rgb.x - 0.5, rgb.y - 0.5, rgb.z - 0.5);
}

export const WebGLCanvas: React.FC<WebGLCanvasProps> = ({ grading, media, onMediaLoaded, isPlaying, seekTime }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const curvesTextureRef = useRef<THREE.DataTexture | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    // Dimensions
    const { width, height } = mountRef.current.getBoundingClientRect();

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera (Orthographic for 2D)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Plane Geometry
    const geometry = new THREE.PlaneGeometry(2, 2);

    // Initial Placeholder Texture
    const placeholderData = new Uint8Array(4 * 256 * 256);
    const placeholderTex = new THREE.DataTexture(placeholderData, 256, 256);
    placeholderTex.needsUpdate = true;

    // Initial Curves Texture (RGBA for compatibility)
    // 256 width * 4 height * 4 channels (RGBA)
    const curvesData = new Uint8Array(256 * 4 * 4);
    const curvesTex = new THREE.DataTexture(curvesData, 256, 4);
    curvesTex.format = THREE.RGBAFormat; 
    curvesTex.minFilter = THREE.LinearFilter;
    curvesTex.magFilter = THREE.LinearFilter;
    curvesTex.generateMipmaps = false;
    curvesTex.needsUpdate = true;
    curvesTextureRef.current = curvesTex;
    
    // Shader Material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: placeholderTex },
        tCurves: { value: curvesTex },
        
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
        
        // Effects
        vignette: { value: 0 },
        vignetteMidpoint: { value: 0.5 },
        vignetteRoundness: { value: 0 },
        vignetteFeather: { value: 0.5 },
        
        grain: { value: 0 },
        grainSize: { value: 1.0 },
        grainRoughness: { value: 0.5 },

        sharpness: { value: 0 },
        toneMapping: { value: 0 },
        
        // Color Grading
        cgShadowsColor: { value: new THREE.Vector3(0, 0, 0) },
        cgMidtonesColor: { value: new THREE.Vector3(0, 0, 0) },
        cgHighlightsColor: { value: new THREE.Vector3(0, 0, 0) },
        cgLumaParams: { value: new THREE.Vector3(0, 0, 0) },
        cgBlending: { value: 0.5 },
        cgBalance: { value: 0 },

        resolution: { value: new THREE.Vector2(width, height) }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    // Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      // Update video texture if playing
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
    };
  }, []);

  // Update Curves Texture
  useEffect(() => {
    if (!grading.curves || !curvesTextureRef.current) return;

    // Size: 256 width, 4 height
    const size = 256;
    // 4 channels (RGBA)
    const data = new Uint8Array(size * 4 * 4); 

    const generateRow = (points: CurvePoint[], rowIndex: number) => {
        // Ensure strictly monotonic and sorted to prevent Spline NaN
        const sorted = [...points].sort((a, b) => a.x - b.x);
        
        // Deduplicate X with EPSILON to ensure dx > 0 for Spline Calculation
        const xs: number[] = [];
        const ys: number[] = [];
        
        if (sorted.length > 0) {
            xs.push(sorted[0].x);
            ys.push(sorted[0].y);
            
            for (let i = 1; i < sorted.length; i++) {
                const prevX = xs[xs.length - 1];
                let currX = sorted[i].x;
                // Force minimum separation to prevent division by zero in spline
                if (currX <= prevX + 0.001) {
                    currX = prevX + 0.001;
                }
                xs.push(currX);
                ys.push(sorted[i].y);
            }
        }

        const spline = new MonotoneCubicSpline(xs, ys);

        for (let i = 0; i < size; i++) {
            const x = i / (size - 1);
            let y = spline.interpolate(x);
            y = Math.max(0, Math.min(1, y)); // Clamp
            
            const val = Math.round(y * 255);
            
            // Write to RGBA
            // Pixel Index = (rowIndex * width + colIndex) * 4
            const pixelIndex = (rowIndex * size + i) * 4;
            
            data[pixelIndex] = val;     // R
            data[pixelIndex + 1] = val; // G
            data[pixelIndex + 2] = val; // B
            data[pixelIndex + 3] = 255; // A (Alpha 1.0)
        }
    };

    generateRow(grading.curves.l, 0); // Luma
    generateRow(grading.curves.r, 1); // Red
    generateRow(grading.curves.g, 2); // Green
    generateRow(grading.curves.b, 3); // Blue

    // Update Texture Data
    curvesTextureRef.current.image.data = data;
    curvesTextureRef.current.needsUpdate = true;
    
    // Explicitly notify material just in case (though reference is same)
    if (materialRef.current) {
        materialRef.current.uniforms.tCurves.value = curvesTextureRef.current;
    }

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
      
      // Effects
      u.vignette.value = grading.vignette;
      u.vignetteMidpoint.value = grading.vignetteMidpoint;
      u.vignetteRoundness.value = grading.vignetteRoundness;
      u.vignetteFeather.value = grading.vignetteFeather;
      
      u.grain.value = grading.grain;
      u.grainSize.value = grading.grainSize;
      u.grainRoughness.value = grading.grainRoughness;
      
      u.sharpness.value = grading.sharpness;
      
      let mode = 0.0;
      if (grading.toneMapping === 'filmic') mode = 1.0;
      if (grading.toneMapping === 'agx') mode = 2.0;
      if (grading.toneMapping === 'soft') mode = 3.0;
      u.toneMapping.value = mode;

      // Color Grading Update
      const cg = grading.colorGrading;
      u.cgShadowsColor.value = getTintVector(cg.shadows.hue, cg.shadows.saturation);
      u.cgMidtonesColor.value = getTintVector(cg.midtones.hue, cg.midtones.saturation);
      u.cgHighlightsColor.value = getTintVector(cg.highlights.hue, cg.highlights.saturation);
      
      u.cgLumaParams.value.set(
          cg.shadows.luminance, 
          cg.midtones.luminance, 
          cg.highlights.luminance
      );
      
      u.cgBlending.value = cg.blending / 100;
      u.cgBalance.value = cg.balance / 100;
    }
  }, [grading]);

  // Layout & Resize Logic
  useEffect(() => {
     const handleLayoutUpdate = () => {
        if (!mountRef.current || !rendererRef.current || !materialRef.current || !meshRef.current) return;
        
        const { width, height } = mountRef.current.getBoundingClientRect();
        rendererRef.current.setSize(width, height);
        materialRef.current.uniforms.resolution.value.set(width, height);

        if (media.width && media.height && width > 0 && height > 0) {
            const screenAspect = width / height;
            const imageAspect = media.width / media.height;

            if (screenAspect > imageAspect) {
                meshRef.current.scale.set(imageAspect / screenAspect, 1, 1);
            } else {
                meshRef.current.scale.set(1, screenAspect / imageAspect, 1);
            }
        } else {
             meshRef.current.scale.set(1, 1, 1);
        }
     };

     handleLayoutUpdate();

     const resizeObserver = new ResizeObserver(() => {
         requestAnimationFrame(handleLayoutUpdate);
     });
     
     if (mountRef.current) {
         resizeObserver.observe(mountRef.current);
     }
     window.addEventListener('resize', handleLayoutUpdate);

     return () => {
         resizeObserver.disconnect();
         window.removeEventListener('resize', handleLayoutUpdate);
     };
  }, [media.width, media.height]);

  // Handle Media Loading
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
          onMediaLoaded({ 
              width: video.videoWidth, 
              height: video.videoHeight, 
              duration: video.duration 
          });
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


  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden group">
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{ 
                 backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                 backgroundSize: '40px 40px'
             }} 
        />
        <div ref={mountRef} className="w-full h-full z-10 relative" />
        {!media.url && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-zinc-500 pointer-events-none">
                <span className="font-['Bebas_Neue'] text-4xl tracking-widest opacity-50">No Signal</span>
                <span className="font-mono text-xs mt-2">Open Media to begin grading</span>
            </div>
        )}
    </div>
  );
};

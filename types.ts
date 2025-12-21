
export interface GradingParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  brightness: number;
  temperature: number;
  tint: number;
  
  // Presence (Detail)
  texture: number; // -1 to 1 (High freq detail)
  clarity: number; // -1 to 1 (Mid freq contrast)
  dehaze: number;  // -1 to 1
  
  // Detail (New)
  detail: {
      denoise: number; // 0-100
      sharpening: {
          amount: number; // 0-150
          radius: number; // 0.5-3.0
          detail: number; // 0-100
          masking: number; // 0-100
      };
  };

  // Effects (Optics)
  vignette: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  vignetteFeather: number;
  distortion: number; // -100 to 100
  distortionCrop: boolean; // Constrain Crop
  chromaticAberration: number; // 0 to 100
  
  // Defringe
  defringe: {
      purpleAmount: number; // 0-100
      purpleHueOffset: number; // -30 to 30
      greenAmount: number; // 0-100
      greenHueOffset: number; // -30 to 30
  };
  
  // Transform (Geometry)
  transform: {
      vertical: number; // -100 to 100
      horizontal: number; // -100 to 100
      rotate: number; // -10 to 10
      aspect: number; // -100 to 100
      scale: number; // 0 to 200 (100 is default)
      xOffset: number; // -100 to 100
      yOffset: number; // -100 to 100
      guides: GuideLine[]; // User drawn guides
  };

  grain: number;
  grainSize: number;
  grainRoughness: number;
  
  halation: number;

  toneMapping: 'standard' | 'filmic' | 'agx' | 'soft' | 'neutral';
  toneStrength: number; // 0.0 to 1.0
  curves: Curves;
  colorGrading: {
    shadows: { hue: number; saturation: number; luminance: number };
    midtones: { hue: number; saturation: number; luminance: number };
    highlights: { hue: number; saturation: number; luminance: number };
    blending: number; // 0-100 (Overlap)
    balance: number;  // -100 to 100 (Shift)
  };
  colorMixer: ColorMixerState;
  
  // Multi-Point Color System
  pointColor: PointColorState;
  
  // Camera Calibration
  calibration: {
      shadowTint: number; // -100 to 100
      red: { hue: number; saturation: number };
      green: { hue: number; saturation: number };
      blue: { hue: number; saturation: number };
  };

  // New Pro Features
  lutStr: string | null; // Raw content of the .cube file
  lutName: string | null;
  lutIntensity: number;
  
  comparisonMode: 'off' | 'split' | 'toggle';
  splitPosition: number; // 0.0 to 1.0
}

export interface GuideLine {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    // Computed based on angle, but can be manually set if we have a UI for it
    type: 'vertical' | 'horizontal'; 
}

export interface PointColorData {
    id: string;
    active: boolean;
    
    // Source Color
    srcHue: number; // 0-360
    srcSat: number; // 0-100
    srcLum: number; // 0-100
    
    // Shifts
    hueShift: number; // -180 to 180
    satShift: number; // -100 to 100
    lumShift: number; // -100 to 100
    
    // Isolation Controls
    hueRange: number; // 0-100
    satRange: number; // 0-100
    lumRange: number; // 0-100
    
    hueFalloff: number; // 0-100
    satFalloff: number; // 0-100
    lumFalloff: number; // 0-100
}

export interface PointColorState {
    showMask: boolean; // Global mask toggle
    activePointIndex: number; // Currently selected index
    points: PointColorData[]; // Array of 8 points
}

export interface ColorMixerChannel {
    hue: number;
    saturation: number;
    luminance: number;
}

export interface ColorMixerState {
    red: ColorMixerChannel;
    orange: ColorMixerChannel;
    yellow: ColorMixerChannel;
    green: ColorMixerChannel;
    aqua: ColorMixerChannel;
    blue: ColorMixerChannel;
    purple: ColorMixerChannel;
    magenta: ColorMixerChannel;
}

export interface Preset {
  id: string;
  name: string;
  params: GradingParams;
}

export interface CurvePoint {
  x: number;
  y: number;
  id: string;
}

export interface Curves {
  l: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export interface MediaState {
  id: string;
  url: string | null;
  name: string;
  type: 'image' | 'video' | null;
  width: number;
  height: number;
  duration?: number;
  currentTime?: number;
  isPlaying?: boolean;
  thumbnail?: string; 
}

export interface SamplerPoint {
  id: string;
  x: number; // UV coordinate 0-1
  y: number; // UV coordinate 0-1
}

export type ToolType = 'move' | 'sampler' | 'point-picker' | 'guided-upright';

export type WindowId = 'canvas' | 'controls' | 'timeline' | 'info' | 'shortcuts';

export interface WindowState {
  id: WindowId;
  isOpen: boolean;
  position: { x: number; y: number };
  zIndex: number;
  title: string;
}

export const DefaultCurves: Curves = {
    l: [{ x: 0, y: 0, id: 'l0' }, { x: 1, y: 1, id: 'l1' }],
    r: [{ x: 0, y: 0, id: 'r0' }, { x: 1, y: 1, id: 'r1' }],
    g: [{ x: 0, y: 0, id: 'g0' }, { x: 1, y: 1, id: 'g1' }],
    b: [{ x: 0, y: 0, id: 'b0' }, { x: 1, y: 1, id: 'b1' }],
};

export const DefaultColorMixer: ColorMixerState = {
    red: { hue: 0, saturation: 0, luminance: 0 },
    orange: { hue: 0, saturation: 0, luminance: 0 },
    yellow: { hue: 0, saturation: 0, luminance: 0 },
    green: { hue: 0, saturation: 0, luminance: 0 },
    aqua: { hue: 0, saturation: 0, luminance: 0 },
    blue: { hue: 0, saturation: 0, luminance: 0 },
    purple: { hue: 0, saturation: 0, luminance: 0 },
    magenta: { hue: 0, saturation: 0, luminance: 0 },
};

export const DefaultGradingParams: GradingParams = {
  exposure: 0,
  contrast: 1,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 1,
  vibrance: 0,
  brightness: 0,
  temperature: 0,
  tint: 0,
  
  // Presence
  texture: 0,
  clarity: 0,
  dehaze: 0,

  // Detail
  detail: {
      denoise: 0,
      sharpening: {
          amount: 40,
          radius: 1.0,
          detail: 25,
          masking: 0
      }
  },

  // Effects Defaults
  vignette: 0,
  vignetteMidpoint: 0.5,
  vignetteRoundness: 0,
  vignetteFeather: 0.5,
  distortion: 0,
  distortionCrop: false, 
  chromaticAberration: 0,
  
  // New
  defringe: {
      purpleAmount: 0,
      purpleHueOffset: 0,
      greenAmount: 0,
      greenHueOffset: 0
  },
  
  // Transform Defaults
  transform: {
      vertical: 0,
      horizontal: 0,
      rotate: 0,
      aspect: 0,
      scale: 100,
      xOffset: 0,
      yOffset: 0,
      guides: []
  },

  grain: 0,
  grainSize: 1.0,
  grainRoughness: 0.5,
  
  halation: 0,

  toneMapping: 'standard',
  toneStrength: 1.0,
  curves: DefaultCurves,
  colorGrading: {
    shadows: { hue: 0, saturation: 0, luminance: 0 },
    midtones: { hue: 0, saturation: 0, luminance: 0 },
    highlights: { hue: 0, saturation: 0, luminance: 0 },
    blending: 50,
    balance: 0
  },
  colorMixer: DefaultColorMixer,
  
  pointColor: {
      showMask: false,
      activePointIndex: -1,
      points: [] 
  },
  
  calibration: {
      shadowTint: 0,
      red: { hue: 0, saturation: 0 },
      green: { hue: 0, saturation: 0 },
      blue: { hue: 0, saturation: 0 }
  },

  // New
  lutStr: null,
  lutName: null,
  lutIntensity: 1.0,
  comparisonMode: 'off',
  splitPosition: 0.5
};

export const DefaultPresets: Preset[] = [
    {
        id: 'preset-cinematic-teal-orange',
        name: 'Teal & Orange',
        params: {
            ...DefaultGradingParams,
            contrast: 1.2,
            saturation: 1.1,
            colorGrading: {
                ...DefaultGradingParams.colorGrading,
                shadows: { hue: 190, saturation: 0.4, luminance: -0.05 },
                midtones: { hue: 35, saturation: 0.1, luminance: 0 },
                highlights: { hue: 35, saturation: 0.3, luminance: 0.05 },
                blending: 60
            },
            calibration: {
                ...DefaultGradingParams.calibration,
                red: { hue: 20, saturation: -10 },
                blue: { hue: -30, saturation: 20 },
                shadowTint: -10
            },
            toneMapping: 'filmic'
        }
    }
];


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
  texture: number;
  clarity: number;
  dehaze: number;
  
  // Detail
  detail: {
      denoise: number;
      sharpening: {
          amount: number;
          radius: number;
          detail: number;
          masking: number;
      };
  };

  // Effects
  vignette: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  vignetteFeather: number;
  distortion: number;
  distortionCrop: boolean;
  chromaticAberration: number;
  
  // Defringe
  defringe: {
      purpleAmount: number;
      purpleHueOffset: number;
      greenAmount: number;
      greenHueOffset: number;
  };
  
  grain: number;
  grainSize: number;
  grainRoughness: number;
  
  halation: number;

  toneMapping: 'standard' | 'filmic' | 'agx' | 'soft' | 'neutral';
  toneStrength: number;
  curves: Curves;
  colorGrading: {
    shadows: { hue: number; saturation: number; luminance: number };
    midtones: { hue: number; saturation: number; luminance: number };
    highlights: { hue: number; saturation: number; luminance: number };
    blending: number;
    balance: number;
  };
  colorMixer: ColorMixerState;
  pointColor: PointColorState;
  
  calibration: {
      shadowTint: number;
      red: { hue: number; saturation: number };
      green: { hue: number; saturation: number };
      blue: { hue: number; saturation: number };
  };

  lutStr: string | null;
  lutName: string | null;
  lutIntensity: number;
  
  comparisonMode: 'off' | 'split' | 'toggle';
  splitPosition: number;
  falseColor: boolean;
}

export interface PointColorData {
    id: string;
    active: boolean;
    srcHue: number; srcSat: number; srcLum: number;
    hueShift: number; satShift: number; lumShift: number;
    hueRange: number; satRange: number; lumRange: number;
    hueFalloff: number; satFalloff: number; lumFalloff: number;
}

export interface PointColorState {
    showMask: boolean;
    activePointIndex: number;
    points: PointColorData[];
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

export interface WebGLCanvasRef {
    exportImage: (filename: string) => void;
    exportVideo: (filename: string, onProgress: (p: number) => void, onComplete: () => void) => void;
}

export type ToolType = 'move' | 'sampler' | 'point-picker';

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
  texture: 0,
  clarity: 0,
  dehaze: 0,
  detail: {
      denoise: 0,
      sharpening: { amount: 40, radius: 1.0, detail: 25, masking: 0 }
  },
  vignette: 0,
  vignetteMidpoint: 0.5,
  vignetteRoundness: 0,
  vignetteFeather: 0.5,
  distortion: 0,
  distortionCrop: false, 
  chromaticAberration: 0,
  defringe: { purpleAmount: 0, purpleHueOffset: 0, greenAmount: 0, greenHueOffset: 0 },
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
  pointColor: { showMask: false, activePointIndex: -1, points: [] },
  calibration: {
      shadowTint: 0,
      red: { hue: 0, saturation: 0 },
      green: { hue: 0, saturation: 0 },
      blue: { hue: 0, saturation: 0 }
  },
  lutStr: null,
  lutName: null,
  lutIntensity: 1.0,
  comparisonMode: 'off',
  splitPosition: 0.5,
  falseColor: false
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

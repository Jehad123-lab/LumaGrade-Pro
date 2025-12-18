
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
  
  // Effects
  vignette: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  vignetteFeather: number;

  grain: number;
  grainSize: number;
  grainRoughness: number;

  sharpness: number;
  toneMapping: 'standard' | 'filmic' | 'agx' | 'soft';
  curves: Curves;
  colorGrading: {
    shadows: { hue: number; saturation: number; luminance: number };
    midtones: { hue: number; saturation: number; luminance: number };
    highlights: { hue: number; saturation: number; luminance: number };
    blending: number; // 0-100 (Overlap)
    balance: number;  // -100 to 100 (Shift)
  };
  colorMixer: ColorMixerState;
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
  url: string | null;
  type: 'image' | 'video' | null;
  width: number;
  height: number;
  duration?: number;
  currentTime?: number;
  isPlaying?: boolean;
}

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
  
  // Effects Defaults
  vignette: 0,
  vignetteMidpoint: 0.5,
  vignetteRoundness: 0,
  vignetteFeather: 0.5,

  grain: 0,
  grainSize: 1.0,
  grainRoughness: 0.5,

  sharpness: 0,
  toneMapping: 'standard',
  curves: DefaultCurves,
  colorGrading: {
    shadows: { hue: 0, saturation: 0, luminance: 0 },
    midtones: { hue: 0, saturation: 0, luminance: 0 },
    highlights: { hue: 0, saturation: 0, luminance: 0 },
    blending: 50,
    balance: 0
  },
  colorMixer: DefaultColorMixer
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
            toneMapping: 'filmic'
        }
    },
    {
        id: 'preset-noir',
        name: 'Noir B&W',
        params: {
            ...DefaultGradingParams,
            saturation: 0,
            contrast: 1.4,
            exposure: 0.1,
            vignette: 0.8,
            grain: 0.5,
            grainSize: 1.5,
            grainRoughness: 0.8,
            curves: {
                ...DefaultCurves,
                l: [{x:0,y:0, id:'0'}, {x:0.3,y:0.2,id:'1'}, {x:0.7,y:0.8,id:'2'}, {x:1,y:1,id:'3'}]
            },
            toneMapping: 'agx'
        }
    },
    {
        id: 'preset-vintage',
        name: 'Vintage Warm',
        params: {
            ...DefaultGradingParams,
            temperature: 0.4,
            tint: 0.1,
            contrast: 0.9,
            highlights: -0.2,
            shadows: 0.2,
            blacks: 0.1,
            vignette: 0.4,
            grain: 0.2,
            grainSize: 2.0,
            colorGrading: {
                ...DefaultGradingParams.colorGrading,
                shadows: { hue: 240, saturation: 0.2, luminance: 0.05 },
                midtones: { hue: 40, saturation: 0.1, luminance: 0 },
                highlights: { hue: 50, saturation: 0.2, luminance: -0.1 },
            }
        }
    }
];

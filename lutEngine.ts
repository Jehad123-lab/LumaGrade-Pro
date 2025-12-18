
import { GradingParams } from './types';
import { MonotoneCubicSpline } from './spline';

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const mix = (x: number, y: number, a: number) => x * (1 - a) + y * a;
const fract = (x: number) => x - Math.floor(x);
const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
};

// --- Utils ---
const sRGBToLinear = (c: number) => Math.pow(c, 2.2);
const linearToSRGB = (c: number) => Math.pow(c, 1.0 / 2.2);

const getLuminance = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

// --- Grading Logic ---
function processPixel(r: number, g: number, b: number, p: GradingParams, splines: {r:any, g:any, b:any}): [number, number, number] {
    // 1. Linearize
    r = sRGBToLinear(r); g = sRGBToLinear(g); b = sRGBToLinear(b);
    
    // 2. Basic Ops
    const ev = Math.pow(2.0, p.exposure);
    r *= ev; g *= ev; b *= ev;
    
    // Contrast
    r = Math.max(0, (r - 0.18) * p.contrast + 0.18);
    g = Math.max(0, (g - 0.18) * p.contrast + 0.18);
    b = Math.max(0, (b - 0.18) * p.contrast + 0.18);
    
    // Tone
    const luma = getLuminance(r, g, b);
    const hMask = smoothstep(0.5, 1.0, luma);
    const sMask = 1.0 - smoothstep(0.0, 0.2, luma);
    
    const applyTone = (c: number) => {
        c += c * p.highlights * 0.5 * hMask;
        c += c * p.shadows * 0.3 * sMask;
        c *= (1.0 + p.whites * 0.5);
        c += p.blacks * 0.05;
        return Math.max(0, c);
    }
    r = applyTone(r); g = applyTone(g); b = applyTone(b);
    
    // 3-Way Grading
    const balance = clamp(p.colorGrading.balance / 100, -1, 1);
    const overlap = clamp(p.colorGrading.blending / 100, 0, 1) * 0.5 + 0.01;
    const shadowThresh = 0.33 + (balance * 0.2);
    const highThresh = 0.66 + (balance * 0.2);
    
    const gradSMask = 1.0 - smoothstep(shadowThresh - overlap, shadowThresh + overlap, luma);
    const gradHMask = smoothstep(highThresh - overlap, highThresh + overlap, luma);
    const gradMMask = 1.0 - gradSMask - gradHMask;
    
    // Helper to get RGB offset from HSL
    const getTint = (h: number, s: number) => {
       const [tr, tg, tb] = hsl2rgb(h, s, 0.5);
       return [tr - 0.5, tg - 0.5, tb - 0.5];
    }
    
    const [sr, sg, sb] = getTint(p.colorGrading.shadows.hue, p.colorGrading.shadows.saturation);
    const [mr, mg, mb] = getTint(p.colorGrading.midtones.hue, p.colorGrading.midtones.saturation);
    const [hr, hg, hb] = getTint(p.colorGrading.highlights.hue, p.colorGrading.highlights.saturation);
    
    r += sr * gradSMask + mr * gradMMask + hr * gradHMask;
    g += sg * gradSMask + mg * gradMMask + hg * gradHMask;
    b += sb * gradSMask + mb * gradMMask + hb * gradHMask;
    
    r += p.colorGrading.shadows.luminance * gradSMask * 0.2;
    g += p.colorGrading.midtones.luminance * gradMMask * 0.2;
    b += p.colorGrading.highlights.luminance * gradHMask * 0.2;
    
    r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
    
    // Temp/Tint
    r *= (1.0 + p.temperature * 0.05);
    b *= (1.0 - p.temperature * 0.05);
    g *= (1.0 + p.tint * 0.05);
    
    // Brightness/Vibrance/Sat
    const finalLuma = getLuminance(r, g, b);
    r += p.brightness * 0.1; g += p.brightness * 0.1; b += p.brightness * 0.1;
    
    // Vibrance
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;
    const vibFactor = 1.0 + (p.vibrance * (1.0 - sat));
    r = mix(finalLuma, r, vibFactor);
    g = mix(finalLuma, g, vibFactor);
    b = mix(finalLuma, b, vibFactor);
    
    // Saturation
    r = mix(finalLuma, r, p.saturation);
    g = mix(finalLuma, g, p.saturation);
    b = mix(finalLuma, b, p.saturation);
    
    // Tone Mapping (Filmic/AgX approx)
    if (p.toneMapping === 'soft') {
        const softClip = (v: number) => Math.max(0, v < 0 ? 0 : Math.min(v, 1.0 - Math.exp(-v * 1.2)));
        r = linearToSRGB(softClip(r));
        g = linearToSRGB(softClip(g));
        b = linearToSRGB(softClip(b));
    } else if (p.toneMapping === 'filmic') {
         const filmic = (v: number) => {
             v *= 1.2;
             const a = v * (v + 0.0245786) - 0.000090537;
             const b = v * (0.983729 * v + 0.4329510) + 0.238081;
             return a / b;
         }
         r = filmic(r); g = filmic(g); b = filmic(b);
    } else if (p.toneMapping === 'agx') {
         // Simplified AgX for CPU
         const agx = (v: number) => {
             v = Math.max(1e-10, v);
             v = Math.log2(v);
             v = (v + 12.47393) / 16.5;
             v = Math.max(0, Math.min(1, v));
             v = v * v * (3.0 - 2.0 * v);
             return v * v;
         }
         r = linearToSRGB(agx(r)); g = linearToSRGB(agx(g)); b = linearToSRGB(agx(b));
    } else {
        const reinhard = (v: number) => v / (v + 1.0);
        r = linearToSRGB(reinhard(r)); g = linearToSRGB(reinhard(g)); b = linearToSRGB(reinhard(b));
    }
    
    // Curves
    r = Math.max(0, Math.min(1, splines.r.interpolate(clamp(r, 0, 1))));
    g = Math.max(0, Math.min(1, splines.g.interpolate(clamp(g, 0, 1))));
    b = Math.max(0, Math.min(1, splines.b.interpolate(clamp(b, 0, 1))));

    return [r, g, b];
}

function createSpline(points: any[]) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const xs = [], ys = [];
    if (sorted.length > 0) {
        xs.push(sorted[0].x); ys.push(sorted[0].y);
        for(let i=1; i<sorted.length; i++) {
            if (sorted[i].x > xs[xs.length-1] + 0.001) {
                xs.push(sorted[i].x); ys.push(sorted[i].y);
            }
        }
    }
    return new MonotoneCubicSpline(xs, ys);
}

export function generateLUT(params: GradingParams, size: number = 33): string {
    const title = "LumaGrade_Export";
    let output = `TITLE "${title}"\n`;
    output += `LUT_3D_SIZE ${size}\n`;
    output += `DOMAIN_MIN 0.0 0.0 0.0\n`;
    output += `DOMAIN_MAX 1.0 1.0 1.0\n`;

    // Pre-calculate Splines
    const splines = {
        r: createSpline(params.curves.r),
        g: createSpline(params.curves.g),
        b: createSpline(params.curves.b)
    };
    
    // We apply Master Curve to RGB simply here for the LUT
    const masterSpline = createSpline(params.curves.l);
    
    const chainedSpline = (val: number, channelSpline: MonotoneCubicSpline) => {
        const v1 = channelSpline.interpolate(val);
        const v2 = masterSpline.interpolate(v1);
        return v2;
    };
    
    const finalSplines = {
        r: { interpolate: (v: number) => chainedSpline(v, splines.r) },
        g: { interpolate: (v: number) => chainedSpline(v, splines.g) },
        b: { interpolate: (v: number) => chainedSpline(v, splines.b) }
    };

    for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
            for (let r = 0; r < size; r++) {
                const ir = r / (size - 1);
                const ig = g / (size - 1);
                const ib = b / (size - 1);
                
                // Note: Sharpen, Clarity, Structure, Dehaze, Vignette, Grain are spatial/complex effects 
                // not suitable for 3D LUTs. They are ignored here to prevent artifacts.
                const [or, og, ob] = processPixel(ir, ig, ib, params, finalSplines);
                
                output += `${or.toFixed(6)} ${og.toFixed(6)} ${ob.toFixed(6)}\n`;
            }
        }
    }
    
    return output;
}

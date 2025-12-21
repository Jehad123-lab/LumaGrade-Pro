
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

export function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
}

export function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
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

// Helper: HSL (0-1) to RGB
function tintToRgb(h: number, s: number, l: number): [number, number, number] {
    return hsl2rgb(h, s, l);
}

// --- Partial Pipeline for Point Color Sampling ---
// Matches the shader order up to applyPointColor
export function getPrePointColor(r: number, g: number, b: number, p: GradingParams): [number, number, number] {
    // 1. Start Linear
    r = sRGBToLinear(r); g = sRGBToLinear(g); b = sRGBToLinear(b);

    // 2. Exposure/Contrast (Linear)
    const ev = Math.pow(2.0, p.exposure);
    r *= ev; g *= ev; b *= ev;

    r = Math.max(0, (r - 0.18) * p.contrast + 0.18);
    g = Math.max(0, (g - 0.18) * p.contrast + 0.18);
    b = Math.max(0, (b - 0.18) * p.contrast + 0.18);

    // 3. Tone (Highlights, Shadows, Whites, Blacks)
    const luma = getLuminance(r, g, b);
    const hMask = smoothstep(0.5, 1.0, luma);
    const sMask = 1.0 - smoothstep(0.0, 0.2, luma);
    
    const tone = (c: number) => {
        c += c * p.highlights * 0.5 * hMask;
        c += c * p.shadows * 0.3 * sMask;
        c *= (1.0 + p.whites * 0.5);
        c += p.blacks * 0.05;
        return Math.max(0, c);
    };
    r = tone(r); g = tone(g); b = tone(b);

    // 4. Dehaze
    if (Math.abs(p.dehaze) > 0.01) {
        const hazeColor = 0.8; 
        if (p.dehaze > 0) {
             const factor = p.dehaze * 0.5;
             r = mix(r, (r - hazeColor * 0.1) / 0.9, factor);
             g = mix(g, (g - hazeColor * 0.1) / 0.9, factor);
             b = mix(b, (b - hazeColor * 0.1) / 0.9, factor);
        } else {
             const factor = -p.dehaze * 0.5;
             r = mix(r, hazeColor, factor);
             g = mix(g, hazeColor, factor);
             b = mix(b, hazeColor, factor);
        }
    }

    // 5. Convert to sRGB for Creative Steps (Mixer, Calibration)
    // IMPORTANT: Matches new shader pipeline
    r = linearToSRGB(r); g = linearToSRGB(g); b = linearToSRGB(b);

    // 6. Color Mixer (sRGB)
    let [h, s, l] = rgb2hsl(r, g, b); 
    h /= 360; s /= 100; l /= 100; 

    const centers = [0, 30/360, 60/360, 120/360, 180/360, 240/360, 270/360, 300/360];
    const mixerKeys = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
    
    let hShift = 0;
    let sMult = 1;
    let lMult = 1;

    mixerKeys.forEach((key, i) => {
        const center = centers[i];
        let dist = Math.abs(h - center);
        if (dist > 0.5) dist = 1.0 - dist;
        
        let width = 0.1;
        if (i === 3 || i === 4 || i === 5) width = 0.15; 
        
        const weight = Math.max(0, 1.0 - dist / width);
        const smoothWeight = weight * weight * (3 - 2 * weight);

        if (smoothWeight > 0) {
            const ch = p.colorMixer[key as keyof typeof p.colorMixer];
            hShift += (ch.hue / 360) * smoothWeight;
            sMult += (ch.saturation / 100) * smoothWeight;
            lMult += (ch.luminance / 100) * smoothWeight * 0.5;
        }
    });

    h += hShift;
    h = h - Math.floor(h);
    s = clamp(s * sMult, 0, 1);
    l = clamp(l * lMult, 0, 1);

    const [rr, gg, bb] = hsl2rgb(h, s, l);
    
    // Return sRGB (Ready for Point Color sampling which expects sRGB visual match)
    // Note: The previous version returned Linear. But our new Shader pipeline uses sRGB for point color.
    // However, the caller `WebGLCanvas` expects to convert to sRGB. 
    // Let's return Linear here to be consistent with "Pre Point Color" data flow if we consider the *block* of creative tools.
    // Actually, `WebGLCanvas` does: `const [h, s, l] = rgb2hsl(linToSrgb(finalR)...)`
    // If we return sRGB here, we should NOT double convert in `WebGLCanvas`.
    // Let's stick to returning Linear so `WebGLCanvas` logic doesn't break, 
    // but we must convert back to Linear here.
    
    const lr = sRGBToLinear(rr);
    const lg = sRGBToLinear(gg);
    const lb = sRGBToLinear(bb);

    return [lr, lg, lb];
}

// --- Grading Logic (Full Pipeline) for LUT ---
function processPixel(r: number, g: number, b: number, p: GradingParams, splines: {r:any, g:any, b:any}): [number, number, number] {
    
    // 1-6: Pre Point Color Stages (ends with sRGB -> Linear conversion)
    [r, g, b] = getPrePointColor(r, g, b, p);

    // 7. Point Color (sRGB Space)
    // Convert Linear to sRGB
    let [sr, sg, sb] = [linearToSRGB(r), linearToSRGB(g), linearToSRGB(b)];
    
    // Iterate over active points
    if (p.pointColor && p.pointColor.points && p.pointColor.points.length > 0) {
        const [h, s, l] = rgb2hsl(sr, sg, sb);
        
        const hNorm = h / 360;
        const sNorm = s / 100;
        const lNorm = l / 100;

        let totalSatFactor = 1.0;
        let totalLumFactor = 1.0;
        let hAccum = 0.0;

        for (const point of p.pointColor.points) {
            if (!point.active) continue;

            const srcH = point.srcHue / 360;
            const srcS = point.srcSat / 100;
            const srcL = point.srcLum / 100;

            let hDist = Math.abs(hNorm - srcH);
            if (hDist > 0.5) hDist = 1.0 - hDist;
            const sDist = Math.abs(sNorm - srcS);
            const lDist = Math.abs(lNorm - srcL);

            const rangeH = (point.hueRange || 20) / 360;
            const fallH = (point.hueFalloff || 10) / 360;
            const rangeS = (point.satRange || 30) / 100;
            const fallS = (point.satFalloff || 10) / 100;
            const rangeL = (point.lumRange || 40) / 100;
            const fallL = (point.lumFalloff || 20) / 100;

            const hMask = 1.0 - smoothstep(rangeH, rangeH + fallH + 0.001, hDist);
            const sMask = 1.0 - smoothstep(rangeS, rangeS + fallS + 0.001, sDist);
            const lMask = 1.0 - smoothstep(rangeL, rangeL + fallL + 0.001, lDist);
            
            const finalMask = hMask * sMask * lMask;

            if (finalMask > 0) {
                hAccum += (point.hueShift / 360) * finalMask;
                totalSatFactor *= (1.0 + (point.satShift / 100) * finalMask);
                totalLumFactor *= (1.0 + (point.lumShift / 100) * finalMask * 0.5);
            }
        }
        
        let newH = hNorm + hAccum;
        newH = newH - Math.floor(newH);
        const newS = clamp(sNorm * totalSatFactor, 0, 1);
        const newL = clamp(lNorm * totalLumFactor, 0, 1);
        
        [sr, sg, sb] = hsl2rgb(newH, newS, newL);
    }

    // 8. Color Grading Wheels (sRGB Space)
    const luma = getLuminance(sr, sg, sb);
    const balance = clamp(p.colorGrading.balance / 100, -1, 1);
    const overlap = clamp(p.colorGrading.blending / 100, 0, 1) * 0.5 + 0.01;
    const shadowThresh = 0.33 + (balance * 0.2);
    const highThresh = 0.66 + (balance * 0.2);
    
    const gradSMask = 1.0 - smoothstep(shadowThresh - overlap, shadowThresh + overlap, luma);
    const gradHMask = smoothstep(highThresh - overlap, highThresh + overlap, luma);
    const gradMMask = 1.0 - gradSMask - gradHMask;
    
    const getTint = (h: number, s: number) => {
       const [tr, tg, tb] = hsl2rgb(h / 360, s / 100, 0.5); 
       return [tr - 0.5, tg - 0.5, tb - 0.5];
    }
    
    const [tsr, tsg, tsb] = getTint(p.colorGrading.shadows.hue, p.colorGrading.shadows.saturation);
    const [tmr, tmg, tmb] = getTint(p.colorGrading.midtones.hue, p.colorGrading.midtones.saturation);
    const [thr, thg, thb] = getTint(p.colorGrading.highlights.hue, p.colorGrading.highlights.saturation);
    
    sr += tsr * gradSMask + tmr * gradMMask + thr * gradHMask;
    sg += tsg * gradSMask + tmg * gradMMask + thg * gradHMask;
    sb += tsb * gradSMask + tmb * gradMMask + thb * gradHMask;
    
    sr += (p.colorGrading.shadows.luminance/100) * gradSMask * 0.2;
    sg += (p.colorGrading.midtones.luminance/100) * gradMMask * 0.2;
    sb += (p.colorGrading.highlights.luminance/100) * gradHMask * 0.2;
    
    sr = Math.max(0, sr); sg = Math.max(0, sg); sb = Math.max(0, sb);
    
    // 9. Finishing in sRGB (Temp/Tint/Sat)
    sr *= (1.0 + p.temperature * 0.05);
    sb *= (1.0 - p.temperature * 0.05);
    sg *= (1.0 + p.tint * 0.05);
    
    const finalLuma = getLuminance(sr, sg, sb);
    sr += p.brightness * 0.1; sg += p.brightness * 0.1; sb += p.brightness * 0.1;
    
    const maxC = Math.max(sr, sg, sb);
    const minC = Math.min(sr, sg, sb);
    const sat = maxC - minC;
    const vibFactor = 1.0 + (p.vibrance * (1.0 - sat));
    sr = mix(finalLuma, sr, vibFactor);
    sg = mix(finalLuma, sg, vibFactor);
    sb = mix(finalLuma, sb, vibFactor);
    
    sr = mix(finalLuma, sr, p.saturation);
    sg = mix(finalLuma, sg, p.saturation);
    sb = mix(finalLuma, sb, p.saturation);
    
    // 10. LUT (sRGB Input) - simplified for CPU (skip)
    
    // 11. Tone Mapping (Linearize first for tone mapping math)
    r = sRGBToLinear(sr);
    g = sRGBToLinear(sg);
    b = sRGBToLinear(sb);
    
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
        r = linearToSRGB(r); g = linearToSRGB(g); b = linearToSRGB(b);
    }
    
    // 12. Curves (Display Space)
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

    const splines = {
        r: createSpline(params.curves.r),
        g: createSpline(params.curves.g),
        b: createSpline(params.curves.b)
    };
    
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
                const [or, og, ob] = processPixel(ir, ig, ib, params, finalSplines);
                output += `${or.toFixed(6)} ${og.toFixed(6)} ${ob.toFixed(6)}\n`;
            }
        }
    }
    
    return output;
}

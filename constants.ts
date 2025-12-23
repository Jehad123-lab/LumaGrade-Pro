
export const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Shared functions for Grading (Main Canvas + Waveform Scope)
export const GRADING_UTILS = `
#define PI 3.14159265359
precision highp float;
precision highp sampler3D;

// Global Corrections
uniform float exposure;
uniform float contrast;
uniform float saturation;
uniform float vibrance;
uniform float brightness;
uniform float highlights;
uniform float shadows;
uniform float whites;
uniform float blacks;
uniform float temperature;
uniform float tint;

// Presence
uniform float textureAmount; // Texture
uniform float clarity; 
uniform float dehaze;

// Detail
uniform float denoise;
uniform float sharpenAmount;
uniform float sharpenRadius;
uniform float sharpenMasking;

// Effects
uniform float vignette;
uniform float vignetteMidpoint;
uniform float vignetteRoundness;
uniform float vignetteFeather;

uniform float grain;
uniform float grainSize;
uniform float grainRoughness;

uniform float halation;

// Lens & Geometry
// Note: distortion & distortionCrop are defined in FRAGMENT_SHADER preamble to avoid redefinition
uniform float defringePurpleAmount;
uniform float defringePurpleHueOffset;
uniform float defringeGreenAmount;
uniform float defringeGreenHueOffset;

uniform float toneMapping; // 0=Standard, 1=Filmic, 2=AgX, 3=Soft, 4=Neutral
uniform float toneStrength; // 0.0 - 1.0

// Color Grading
uniform vec3 cgShadowsColor; // RGB
uniform vec3 cgMidtonesColor; // RGB
uniform vec3 cgHighlightsColor; // RGB
uniform vec3 cgLumaParams; // x=Shadows, y=Mids, z=Highlights
uniform float cgBlending; // 0-1 (Overlap/Softness)
uniform float cgBalance; // -1 to 1 (Range Shift)

// Calibration
uniform vec2 calibRed;   // x=Hue(deg), y=Sat(-1 to 1)
uniform vec2 calibGreen;
uniform vec2 calibBlue;
uniform float calibShadowTint;

// Color Mixer (8 Channels: R, O, Y, G, A, B, P, M)
// x = Hue Shift (Degrees / 360), y = Saturation Shift (-1 to 1), z = Luminance Shift (-1 to 1)
uniform vec3 cmOffsets[8]; 

// Point Color System (Max 8 Points)
uniform vec3 pcSources[8]; // Source Colors
uniform vec3 pcShifts[8]; // Shift Parameters
uniform vec3 pcRanges[8]; // Range Parameters
uniform vec3 pcFalloffs[8]; // Falloff Parameters
uniform float pcActives[8]; // 1.0 if active, 0.0 if not

uniform int pcCount; // Number of active points (optimization, but we usually iterate 8)
uniform float pcShowMask;
uniform int pcMaskIndex; // Which point to visualize mask for (-1 for none or combined)

// LUT
uniform sampler3D tLut;
uniform float lutIntensity;
uniform float hasLut;
uniform float lutSize; 

// Split/False Color
uniform int comparisonMode; // 0=off, 1=split, 2=bypass
uniform float splitPosition; 
uniform float falseColor; // 0 or 1

// UTILS

float random(vec2 uv) {
    return fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float grainNoise(vec2 uv, vec2 resolution, float size, float roughness) {
    float scale = max(0.1, size);
    vec2 quantUV = floor(uv * resolution / scale) / (resolution / scale);
    return random(quantUV);
}

vec3 sRGBToLinear(vec3 color) {
    return pow(color, vec3(2.2));
}

vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// COLOR SPACE CONVERSIONS

vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float l = (maxC + minC) / 2.0;
    
    if (maxC == minC) {
        return vec3(0.0, 0.0, l);
    }
    
    float d = maxC - minC;
    float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    
    float h = 0.0;
    if (maxC == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
    
    return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
    if(t < 0.0) t += 1.0;
    if(t > 1.0) t -= 1.0;
    if(t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if(t < 1.0/2.0) return q;
    if(t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
}

vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb;
    if(hsl.y == 0.0) {
        rgb = vec3(hsl.z);
    } else {
        float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
        float p = 2.0 * hsl.z - q;
        rgb.r = hue2rgb(p, q, hsl.x + 1.0/3.0);
        rgb.g = hue2rgb(p, q, hsl.x);
        rgb.b = hue2rgb(p, q, hsl.x - 1.0/3.0);
    }
    return rgb;
}

// FALSE COLOR LOGIC
// Maps luminance to standard IRE false color ranges
vec3 getFalseColor(vec3 color) {
    float l = getLuminance(color);
    
    vec3 outColor = vec3(l * 0.2); // Default to dimmed monochrome
    
    // 0 - 5 IRE: Purple (Underexposed)
    if (l < 0.05) outColor = mix(vec3(0.5, 0.0, 0.5), vec3(0.2, 0.0, 0.5), l / 0.05);
    
    // 5 - 10 IRE: Blue
    else if (l < 0.10) outColor = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 0.5, 1.0), (l - 0.05) / 0.05);
    
    // 40 - 50 IRE: Green (Skin Tones / Mid-Grey Card)
    else if (l > 0.40 && l < 0.50) outColor = vec3(0.0, 0.8, 0.0);
    
    // 50 - 55 IRE: Pink (Skin Highlights)
    else if (l >= 0.50 && l < 0.55) outColor = vec3(1.0, 0.6, 0.7);
    
    // 85 - 95 IRE: Yellow (Highlights)
    else if (l > 0.85 && l < 0.95) outColor = vec3(1.0, 1.0, 0.0);
    
    // 95 - 100 IRE: Red (Clipping)
    else if (l >= 0.95) outColor = vec3(1.0, 0.0, 0.0);
    
    return outColor;
}

// GRADING OPS

vec3 adjustExposure(vec3 color, float ev) {
    return color * pow(2.0, ev);
}

vec3 adjustContrast(vec3 color, float cont) {
    return max(vec3(0.0), (color - 0.18) * cont + 0.18);
}

vec3 adjustSaturation(vec3 color, float sat) {
    float luma = getLuminance(color);
    return mix(vec3(luma), color, sat);
}

vec3 adjustVibrance(vec3 color, float vib) {
    float luma = getLuminance(color);
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    float sat = maxC - minC;
    return mix(vec3(luma), color, 1.0 + (vib * (1.0 - sat)));
}

// Increased sensitivity for Temp/Tint (x3)
vec3 adjustTempTint(vec3 color, float temp, float tint) {
    // Temp: -2 to 2 input. 
    // 0.15 multiplier means max shift is +/- 30% per channel.
    color.r *= (1.0 + temp * 0.15);
    color.b *= (1.0 - temp * 0.15);
    // Tint
    color.g *= (1.0 + tint * 0.15);
    return color;
}

// Increased sensitivity for Tones
vec3 adjustTone(vec3 color, float h, float s, float w, float b) {
    float luma = getLuminance(color);
    float hMask = smoothstep(0.5, 1.0, luma);
    color += color * h * 0.6 * hMask; // Highlights
    float sMask = 1.0 - smoothstep(0.0, 0.2, luma);
    color += color * s * 0.4 * sMask; // Shadows
    color *= (1.0 + w * 0.6); // Whites
    color += b * 0.15; // Blacks (Lift)
    return max(vec3(0.0), color);
}

// OPERATES IN sRGB SPACE
vec3 applyCalibration(vec3 color) {
    vec3 hsv = rgb2hsl(color);
    float h = hsv.x;
    float distR = min(abs(h - 0.0), min(abs(h - 1.0), abs(h + 1.0)));
    float distG = abs(h - 0.333);
    float distB = abs(h - 0.666);
    float weightR = smoothstep(0.33, 0.0, distR);
    float weightG = smoothstep(0.33, 0.0, distG);
    float weightB = smoothstep(0.33, 0.0, distB);
    float total = weightR + weightG + weightB;
    if(total > 0.0) {
        weightR /= total;
        weightG /= total;
        weightB /= total;
    }
    float hueShift = (calibRed.x/360.0) * weightR + (calibGreen.x/360.0) * weightG + (calibBlue.x/360.0) * weightB;
    float satShift = (1.0 + calibRed.y) * weightR + (1.0 + calibGreen.y) * weightG + (1.0 + calibBlue.y) * weightB;
    hsv.x += hueShift;
    hsv.x = fract(hsv.x);
    hsv.y = clamp(hsv.y * satShift, 0.0, 1.0);
    vec3 calibColor = hsl2rgb(hsv);
    float luma = getLuminance(calibColor);
    float shadowMask = 1.0 - smoothstep(0.0, 0.4, luma);
    calibColor.g += calibShadowTint * 0.1 * shadowMask;
    return calibColor;
}

vec3 applyDehaze(vec3 color, float amount) {
    if (abs(amount) < 0.01) return color;
    vec3 hazeColor = vec3(0.7, 0.7, 0.8);
    // Stronger Dehaze
    if (amount > 0.0) {
         return mix(color, (color - hazeColor * 0.1) / (1.0 - 0.1), amount * 0.8);
    } else {
         return mix(color, hazeColor, -amount * 0.8);
    }
}

vec3 applyVignette(vec3 color, vec2 uv, vec2 resolution) {
    if (vignette <= 0.0) return color;
    vec2 coord = uv - 0.5;
    float aspect = resolution.x / resolution.y;
    vec2 circleCoord = coord;
    circleCoord.x *= mix(1.0, aspect, vignetteRoundness); 
    float dist = length(circleCoord);
    float radius = vignetteMidpoint * 0.7;
    float feather = max(0.01, vignetteFeather);
    float mask = smoothstep(radius, radius + feather, dist);
    return color * (1.0 - (mask * vignette));
}

// LENS CORRECTIONS

vec3 applyDefringe(vec3 color) {
    if (defringePurpleAmount <= 0.0 && defringeGreenAmount <= 0.0) return color;
    
    vec3 hsl = rgb2hsl(color);
    float h = hsl.x; // 0-1
    float s = hsl.y;
    
    // Purple Defringe
    // Standard Purple Fringing is around 280-300 deg (0.77 - 0.83).
    // offset varies this center.
    float pCenter = 0.8 + (defringePurpleHueOffset / 360.0);
    float pWidth = 0.05; 
    float pDist = abs(h - pCenter);
    if (pDist > 0.5) pDist = 1.0 - pDist;
    float pMask = smoothstep(pWidth + 0.05, pWidth, pDist);
    
    // Green Defringe
    // Standard Green Fringing is around 120-140 deg (0.33 - 0.38).
    float gCenter = 0.35 + (defringeGreenHueOffset / 360.0);
    float gWidth = 0.05;
    float gDist = abs(h - gCenter);
    if (gDist > 0.5) gDist = 1.0 - gDist;
    float gMask = smoothstep(gWidth + 0.05, gWidth, gDist);
    
    float newSat = s;
    if (defringePurpleAmount > 0.0) {
        float factor = 1.0 - (pMask * (defringePurpleAmount / 100.0));
        newSat *= factor;
    }
    if (defringeGreenAmount > 0.0) {
        float factor = 1.0 - (gMask * (defringeGreenAmount / 100.0));
        newSat *= factor;
    }
    
    hsl.y = newSat;
    return hsl2rgb(hsl);
}

// OPERATES IN sRGB SPACE
vec3 applyColorGrading(vec3 color) {
    float luma = getLuminance(color); // Perceptual Luma in sRGB
    float balance = clamp(cgBalance, -1.0, 1.0);
    float overlap = clamp(cgBlending, 0.0, 1.0) * 0.5 + 0.01; 
    float shadowThresh = 0.33 + (balance * 0.2);
    float highThresh = 0.66 + (balance * 0.2);
    float shadowMask = 1.0 - smoothstep(shadowThresh - overlap, shadowThresh + overlap, luma);
    float highMask = smoothstep(highThresh - overlap, highThresh + overlap, luma);
    float midMask = 1.0 - shadowMask - highMask;
    vec3 tinted = color;
    tinted += cgShadowsColor * shadowMask;
    tinted += cgMidtonesColor * midMask;
    tinted += cgHighlightsColor * highMask;
    tinted += cgLumaParams.x * shadowMask * 0.2; 
    tinted += cgLumaParams.y * midMask * 0.2; 
    tinted += cgLumaParams.z * highMask * 0.2; 
    return max(vec3(0.0), tinted);
}

// OPERATES IN sRGB SPACE
vec3 applyColorMixer(vec3 color) {
    vec3 hsl = rgb2hsl(color);
    float h = hsl.x; 
    float centers[8];
    centers[0] = 0.0; centers[1] = 30.0/360.0; centers[2] = 60.0/360.0; centers[3] = 120.0/360.0;
    centers[4] = 180.0/360.0; centers[5] = 240.0/360.0; centers[6] = 270.0/360.0; centers[7] = 300.0/360.0;
    vec3 finalAdj = vec3(0.0);
    for(int i = 0; i < 8; i++) {
        float center = centers[i];
        float dist = abs(h - center);
        if (dist > 0.5) dist = 1.0 - dist; 
        float width = 0.1;
        if (i == 3 || i == 4 || i == 5) width = 0.15; 
        float weight = smoothstep(width, 0.0, dist);
        finalAdj += cmOffsets[i] * weight;
    }
    hsl.x += finalAdj.x; 
    hsl.y = clamp(hsl.y * (1.0 + finalAdj.y), 0.0, 1.0); 
    hsl.z = clamp(hsl.z * (1.0 + finalAdj.z * 0.5), 0.0, 1.0); 
    hsl.x = fract(hsl.x);
    return hsl2rgb(hsl);
}

// Multi-Point Color Logic (Operates in sRGB Space internally)
vec4 applyMultiPointColor(vec3 srgbColor) {
    vec3 hsl = rgb2hsl(srgbColor);
    
    float totalSatFactor = 1.0;
    float totalLumFactor = 1.0;
    float hueShiftAccum = 0.0;
    
    float debugMask = 0.0;

    for(int i = 0; i < 8; i++) {
        if (pcActives[i] < 0.5) continue;

        vec3 src = pcSources[i]; // Normalized HSL (0-1)
        vec3 shift = pcShifts[i]; // Normalized Shifts
        vec3 range = pcRanges[i]; // Normalized Ranges
        vec3 falloff = pcFalloffs[i]; // Normalized Falloff

        // Hue Dist
        float hDist = abs(hsl.x - src.x);
        if (hDist > 0.5) hDist = 1.0 - hDist;
        
        // Sat/Lum Dist
        float sDist = abs(hsl.y - src.y);
        float lDist = abs(hsl.z - src.z);
        
        // Masks
        float hMask = 1.0 - smoothstep(range.x, range.x + falloff.x + 0.001, hDist);
        float sMask = 1.0 - smoothstep(range.y, range.y + falloff.y + 0.001, sDist);
        float lMask = 1.0 - smoothstep(range.z, range.z + falloff.z + 0.001, lDist);
        
        float finalMask = hMask * sMask * lMask;
        
        // Accumulate Shifts
        hueShiftAccum += shift.x * finalMask; 
        totalSatFactor *= (1.0 + shift.y * finalMask);
        totalLumFactor *= (1.0 + shift.z * finalMask * 0.5);

        // Capture mask for visualization
        if (i == pcMaskIndex) {
            debugMask = finalMask;
        }
    }
    
    hsl.x += hueShiftAccum;
    hsl.x = fract(hsl.x);
    hsl.y = clamp(hsl.y * totalSatFactor, 0.0, 1.0);
    hsl.z = clamp(hsl.z * totalLumFactor, 0.0, 1.0);
    
    return vec4(hsl2rgb(hsl), debugMask);
}

// ----------------------------------------------------------------------
// SPATIAL EFFECTS
// ----------------------------------------------------------------------

// 1. Bilateral Denoise (Approx)
// Manually unrolled 3x3 kernel (9 taps)
vec3 applyDenoise(vec3 color, vec2 uv, vec2 resolution, sampler2D tDiffuse) {
    if (denoise <= 0.0) return color;
    
    float sigmaSpace = 2.0;
    float sigmaColor = 0.15; // Tolerance
    
    vec3 sum = vec3(0.0);
    float weightSum = 0.0;
    vec2 px = 1.0 / resolution;
    
    // Tap 1: (0,0) Center
    {
        vec3 neighbor = texture2D(tDiffuse, uv).rgb;
        float wSpace = 1.0;
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 2: (-1,-1)
    {
        vec2 off = vec2(-1.0, -1.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 2.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 3: (0,-1)
    {
        vec2 off = vec2(0.0, -1.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 1.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 4: (1,-1)
    {
        vec2 off = vec2(1.0, -1.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 2.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 5: (-1,0)
    {
        vec2 off = vec2(-1.0, 0.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 1.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 6: (1,0)
    {
        vec2 off = vec2(1.0, 0.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 1.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 7: (-1,1)
    {
        vec2 off = vec2(-1.0, 1.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 2.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 8: (0,1)
    {
        vec2 off = vec2(0.0, 1.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 1.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    // Tap 9: (1,1)
    {
        vec2 off = vec2(1.0, 1.0) * px;
        vec3 neighbor = texture2D(tDiffuse, uv + off).rgb;
        float dist2 = 2.0;
        float wSpace = exp(-dist2 / (2.0 * sigmaSpace * sigmaSpace));
        vec3 diff = neighbor - color;
        float wColor = exp(-dot(diff, diff) / (2.0 * sigmaColor * sigmaColor));
        float weight = wSpace * wColor;
        sum += neighbor * weight;
        weightSum += weight;
    }
    
    return mix(color, sum / max(weightSum, 0.001), denoise * 0.01);
}

// 2. Unsharp Masking with Threshold
vec3 applySharpening(vec3 color, vec2 uv, vec2 resolution, sampler2D tDiffuse) {
    if (sharpenAmount <= 0.0) return color;
    
    // Sample surrounding area (Gaussian Blur approx)
    // Radius controls the spread
    float radius = max(0.5, sharpenRadius);
    vec2 off = (1.0 / resolution) * radius;
    
    vec3 blur = vec3(0.0);
    blur += texture2D(tDiffuse, uv + vec2(-off.x, -off.y)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(0.0, -off.y)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(off.x, -off.y)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(-off.x, 0.0)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(0.0, 0.0)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(off.x, 0.0)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(-off.x, off.y)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(0.0, off.y)).rgb;
    blur += texture2D(tDiffuse, uv + vec2(off.x, off.y)).rgb;
    blur /= 9.0;
    
    // High Pass (Detail)
    vec3 detail = color - blur;
    
    // Masking: Calculate local variance/edge magnitude
    // Simple edge detection based on the detail magnitude
    float edgeMag = length(detail);
    
    // Masking slider: 0 = Sharpen All, 100 = Sharpen Only Strong Edges
    float threshold = sharpenMasking / 100.0 * 0.1; // Scale threshold
    
    // Mask factor: 1.0 if edge > threshold, 0.0 if flat
    float mask = smoothstep(threshold, threshold + 0.02, edgeMag);
    
    // If masking is 0, mask factor is 1.0 everywhere.
    if (sharpenMasking <= 0.0) mask = 1.0;
    
    // Apply
    float strength = sharpenAmount / 100.0;
    return color + detail * strength * mask;
}

vec3 SoftClip(vec3 v) {
    vec3 x = max(vec3(0.0), v);
    return min(x, 1.0 - exp(-x * 1.2)); 
}

vec3 ACESFilmic(vec3 v) {
    v *= 0.6; 
    float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;
    return clamp((v * (a * v + b)) / (v * (c * v + d) + e), 0.0, 1.0);
}

vec3 AgX(vec3 v) {
    vec3 x = v;
    x = max(vec3(1e-10), x);
    x = log2(x);
    x = (x + 12.47393) / 16.5;
    x = clamp(x, 0.0, 1.0);
    x = x * x * (3.0 - 2.0 * x); 
    return x * x; 
}

vec3 applyCurves(vec3 color, sampler2D tCurves) {
    float r = texture2D(tCurves, vec2(clamp(color.r, 0.0, 1.0), 0.375)).r;
    float g = texture2D(tCurves, vec2(clamp(color.g, 0.0, 1.0), 0.625)).r;
    float b = texture2D(tCurves, vec2(clamp(color.b, 0.0, 1.0), 0.875)).r;
    vec3 c = vec3(r, g, b);
    c.r = texture2D(tCurves, vec2(c.r, 0.125)).r;
    c.g = texture2D(tCurves, vec2(c.g, 0.125)).r;
    c.b = texture2D(tCurves, vec2(c.b, 0.125)).r;
    return c;
}

vec3 applyLUT(vec3 color) {
    if (hasLut < 0.5) return color;
    vec3 lutColor = texture(tLut, clamp(color, 0.0, 1.0)).rgb;
    return mix(color, lutColor, lutIntensity);
}

vec3 calculateFinalColor(vec3 color, vec2 uv, vec2 resolution, sampler2D tCurves, sampler2D tDiffuse) {
    // 1. Spatial Pre-Processing (Denoise & Sharpen)
    // Applied on original texture data
    
    // Denoise first
    if (denoise > 0.0) {
        color = applyDenoise(color, uv, resolution, tDiffuse);
    }
    
    // Texture/Clarity (Old)
    if (abs(textureAmount) > 0.0) {
        vec2 px = 1.0 / resolution;
        vec3 n  = texture2D(tDiffuse, uv + vec2(0.0, -px.y)).rgb;
        vec3 s  = texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb;
        vec3 e  = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb;
        vec3 w  = texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb;
        vec3 laplacian = n + s + e + w - 4.0 * color;
        color -= laplacian * textureAmount * 2.0; 
    }
    
    // Smart Sharpening (New)
    if (sharpenAmount > 0.0) {
        color = applySharpening(color, uv, resolution, tDiffuse);
    }

    // 2. Base Linear Corrections
    color = sRGBToLinear(color); // Start Linear Pipeline
    color = adjustExposure(color, exposure);
    color = adjustContrast(color, contrast);
    color = adjustTone(color, highlights, shadows, whites, blacks);
    color = applyDehaze(color, dehaze);
    
    // 3. Clarity (Linear approx)
    if (clarity != 0.0) {
        color = mix(color, smoothstep(0.0, 1.0, color), clarity * 0.3);
    }
    
    // 4. Halation (Linear)
    if (halation > 0.0) {
        vec3 haloAccum = vec3(0.0);
        float aspect = resolution.x / resolution.y;
        float radius = halation * 0.01; 
        
        // Fixed 8-tap ring (manually unrolled)
        // 1.
        {
            vec2 offset = vec2(1.0, 0.0) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 2.
        {
            vec2 offset = vec2(0.707, 0.707) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 3.
        {
            vec2 offset = vec2(0.0, 1.0) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 4.
        {
            vec2 offset = vec2(-0.707, 0.707) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 5.
        {
            vec2 offset = vec2(-1.0, 0.0) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 6.
        {
            vec2 offset = vec2(-0.707, -0.707) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 7.
        {
            vec2 offset = vec2(0.0, -1.0) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        // 8.
        {
            vec2 offset = vec2(0.707, -0.707) * radius;
            offset.x /= aspect; 
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
        }
        
        haloAccum /= 8.0;
        vec3 haloTint = vec3(1.0, 0.4, 0.1); 
        color += haloAccum * haloTint * halation * 2.0;
    }

    // 5. Switch to sRGB for Creative Grading (Perceptual)
    color = linearToSRGB(color);
    
    // Lens Corrections (Defringe)
    color = applyDefringe(color);
    
    color = applyCalibration(color);
    color = applyColorMixer(color);

    // Point Color (Returns mask in Alpha)
    vec4 pcResult = applyMultiPointColor(color);
    color = pcResult.rgb;

    // Mask Visualization override
    if (pcShowMask > 0.5) {
        return vec3(pcResult.a); // Return mask
    }

    color = applyColorGrading(color);
    
    // 6. Finishing
    color = adjustTempTint(color, temperature, tint);
    color += brightness * 0.1;
    color = adjustVibrance(color, vibrance);
    color = adjustSaturation(color, saturation);
    color = applyVignette(color, uv, resolution);

    color = applyLUT(color);

    // 7. Tone Mapping / ODT (Display Transform)
    vec3 linColor = sRGBToLinear(color);
    vec3 mappedColor = linColor;
    if (toneMapping < 0.5) {
        mappedColor = clamp(linColor, 0.0, 1.0);
    } else if (toneMapping < 1.5) {
        mappedColor = ACESFilmic(linColor);
    } else if (toneMapping < 2.5) {
        mappedColor = AgX(linColor);
    } else if (toneMapping < 3.5) {
        mappedColor = SoftClip(linColor);
    } else {
        mappedColor = linColor; // Neutral
    }
    
    color = mix(clamp(color, 0.0, 1.0), linearToSRGB(mappedColor), toneStrength);

    // 8. Curves (Display Space)
    color = applyCurves(color, tCurves);

    // 9. Grain (Post)
    if (grain > 0.0) {
        float noise = grainNoise(uv, resolution, grainSize, grainRoughness);
        float strength = grain * 0.1; 
        color += (noise - 0.5) * strength;
    }
    
    return color;
}
`;

export const FRAGMENT_SHADER = `
${GRADING_UTILS}

uniform sampler2D tDiffuse;
uniform sampler2D tCurves;
uniform vec2 resolution;

uniform float distortion;
uniform float distortionCrop;
uniform float chromaticAberration;

varying vec2 vUv;

void main() {
    vec2 uv = vUv;
    
    // Apply Distortion (Simple Lens Model)
    if (abs(distortion) > 0.01) {
        vec2 center = vec2(0.5);
        vec2 rel = uv - center;
        float r2 = dot(rel, rel);
        float f = 1.0 + (distortion * 0.01) * r2; 
        uv = center + rel * f;
    }
    
    // Bounds check
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec3 baseColor = vec3(0.0);

    // Chromatic Aberration
    if (abs(chromaticAberration) > 0.01) {
        vec2 center = vec2(0.5);
        vec2 dist = uv - center;
        float strength = chromaticAberration * 0.002;
        
        vec2 uvR = uv - dist * strength;
        vec2 uvB = uv + dist * strength;
        
        float r = texture2D(tDiffuse, uvR).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uvB).b;
        baseColor = vec3(r, g, b);
    } else {
        baseColor = texture2D(tDiffuse, uv).rgb;
    }

    // -- Pipeline Output Calculation --
    vec3 gradedColor = calculateFinalColor(baseColor, uv, resolution, tCurves, tDiffuse);

    // -- View Logic: Split Screen / Bypass --
    vec3 displayColor = gradedColor;

    if (comparisonMode == 2) {
        // Bypass Mode
        displayColor = baseColor;
    } else if (comparisonMode == 1) {
        // Split Screen (Standard: Left=Before, Right=After)
        // Adjust for Split Position
        if (vUv.x < splitPosition) {
             displayColor = baseColor; // Original
        } else {
             displayColor = gradedColor; // Graded
        }
    }

    // -- False Color Overlay (Applied to Final Display) --
    if (falseColor > 0.5) {
        displayColor = getFalseColor(displayColor);
    }

    gl_FragColor = vec4(displayColor, 1.0);
}
`;

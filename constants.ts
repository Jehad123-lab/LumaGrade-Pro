

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

// Effects
uniform float vignette;
uniform float vignetteMidpoint;
uniform float vignetteRoundness;
uniform float vignetteFeather;

uniform float grain;
uniform float grainSize;
uniform float grainRoughness;

uniform float halation;

uniform float sharpness;
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

// LUT
uniform sampler3D tLut;
uniform float lutIntensity;
uniform float hasLut;
uniform float lutSize; 

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

vec3 adjustTempTint(vec3 color, float temp, float tint) {
    color.r *= (1.0 + temp * 0.05);
    color.b *= (1.0 - temp * 0.05);
    color.g *= (1.0 + tint * 0.05);
    return color;
}

vec3 adjustTone(vec3 color, float h, float s, float w, float b) {
    float luma = getLuminance(color);
    float hMask = smoothstep(0.5, 1.0, luma);
    color += color * h * 0.5 * hMask;
    float sMask = 1.0 - smoothstep(0.0, 0.2, luma);
    color += color * s * 0.3 * sMask;
    color *= (1.0 + w * 0.5);
    color += b * 0.05;
    return max(vec3(0.0), color);
}

vec3 applyCalibration(vec3 color) {
    // Lightroom-style Camera Calibration
    // We approximate this by shifting hue/sat for pixels dominated by R, G, or B.
    
    vec3 hsv = rgb2hsl(color);
    float h = hsv.x;
    float s = hsv.y;
    
    // Weights for how much the pixel belongs to R, G, B primaries
    // Red is at 0/1.0, Green at 0.33, Blue at 0.66
    
    float distR = min(abs(h - 0.0), min(abs(h - 1.0), abs(h + 1.0)));
    float distG = abs(h - 0.333);
    float distB = abs(h - 0.666);
    
    // Smooth masks
    float weightR = smoothstep(0.33, 0.0, distR);
    float weightG = smoothstep(0.33, 0.0, distG);
    float weightB = smoothstep(0.33, 0.0, distB);
    
    // Normalize weights
    float total = weightR + weightG + weightB;
    if(total > 0.0) {
        weightR /= total;
        weightG /= total;
        weightB /= total;
    }
    
    // Apply Primary Shifts
    // Hue shift is additive (degrees / 360)
    float hueShift = (calibRed.x/360.0) * weightR + (calibGreen.x/360.0) * weightG + (calibBlue.x/360.0) * weightB;
    
    // Sat shift is multiplicative
    float satShift = (1.0 + calibRed.y) * weightR + (1.0 + calibGreen.y) * weightG + (1.0 + calibBlue.y) * weightB;
    
    hsv.x += hueShift;
    hsv.x = fract(hsv.x);
    hsv.y = clamp(hsv.y * satShift, 0.0, 1.0);
    
    vec3 calibColor = hsl2rgb(hsv);
    
    // Shadow Tint (Green/Magenta bias in darks)
    float luma = getLuminance(calibColor);
    float shadowMask = 1.0 - smoothstep(0.0, 0.4, luma);
    calibColor.g += calibShadowTint * 0.05 * shadowMask;
    
    return calibColor;
}

vec3 applyDehaze(vec3 color, float amount) {
    if (abs(amount) < 0.01) return color;
    
    // Simple Dehaze approx: Boost contrast and saturation in low-contrast areas
    // Real DCP is too heavy. We simulate it by pushing away from a "haze color"
    vec3 hazeColor = vec3(0.8, 0.8, 0.9); // Bluish white haze
    if (amount > 0.0) {
         // Removing haze: Push pixel away from haze color
         return mix(color, (color - hazeColor * 0.1) / (1.0 - 0.1), amount * 0.5);
    } else {
         // Adding haze: Blend towards haze color
         return mix(color, hazeColor, -amount * 0.5);
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

vec3 applyColorGrading(vec3 color) {
    float luma = getLuminance(color);
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

// Color Mixer Logic
vec3 applyColorMixer(vec3 color) {
    vec3 hsl = rgb2hsl(color);
    float h = hsl.x; // 0.0 - 1.0
    
    // Channel Centers (Normalized 0-1)
    float centers[8];
    centers[0] = 0.0;         // Red
    centers[1] = 30.0/360.0;  // Orange
    centers[2] = 60.0/360.0;  // Yellow
    centers[3] = 120.0/360.0; // Green
    centers[4] = 180.0/360.0; // Aqua
    centers[5] = 240.0/360.0; // Blue
    centers[6] = 270.0/360.0; // Purple
    centers[7] = 300.0/360.0; // Magenta
    
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

vec3 SoftClip(vec3 v) {
    vec3 x = max(vec3(0.0), v);
    return min(x, 1.0 - exp(-x * 1.2)); 
}

vec3 ACESFilmic(vec3 v) {
    v *= 0.6; // Exposure compensation for ACES
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((v * (a * v + b)) / (v * (c * v + d) + e), 0.0, 1.0);
}

vec3 AgX(vec3 v) {
    // Simplified AgX Approximation
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
    // Texture (High Pass Sharpening)
    // We do this early on the base texture before other transforms
    if (abs(textureAmount) > 0.0 || sharpness > 0.0) {
        vec2 px = 1.0 / resolution;
        
        // 5-tap kernel for basic edge detection
        vec3 n  = texture2D(tDiffuse, uv + vec2(0.0, -px.y)).rgb;
        vec3 s  = texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb;
        vec3 e  = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb;
        vec3 w  = texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb;
        
        vec3 laplacian = n + s + e + w - 4.0 * color;
        
        // Texture enhances these edges
        float totalSharp = textureAmount + sharpness;
        color -= laplacian * totalSharp * 2.0; 
    }

    color = sRGBToLinear(color);
    
    // Calibration (Apply early to influence downstream)
    color = applyCalibration(color);

    // Basic Tone
    color = adjustExposure(color, exposure);
    color = adjustContrast(color, contrast);
    color = adjustTone(color, highlights, shadows, whites, blacks);

    // Dehaze / Clarity Approx
    color = applyDehaze(color, dehaze);
    if (clarity != 0.0) {
        // Simple local contrast approximation (Midtone contrast boost)
        float l = getLuminance(color);
        color = mix(color, smoothstep(0.0, 1.0, color), clarity * 0.3);
    }
    
    // Halation / Bloom
    if (halation > 0.0) {
        vec3 haloAccum = vec3(0.0);
        float samples = 0.0;
        float aspect = resolution.x / resolution.y;
        float radius = halation * 0.01; 
        float jitter = random(uv) * 6.28;
        
        for(int i = 0; i < 8; i++) {
            float angle = jitter + (float(i) / 8.0) * 6.28;
            vec2 offset = vec2(cos(angle), sin(angle)) * radius;
            offset.x /= aspect; 
            
            vec3 s = texture2D(tDiffuse, uv + offset).rgb;
            s = sRGBToLinear(s); 
            vec3 brightness = max(vec3(0.0), s - 0.5); 
            haloAccum += brightness;
            samples += 1.0;
        }
        haloAccum /= samples;
        vec3 haloTint = vec3(1.0, 0.4, 0.1); 
        color += haloAccum * haloTint * halation * 2.0;
    }

    color = applyColorMixer(color);
    color = applyColorGrading(color);
    color = adjustTempTint(color, temperature, tint);
    color += brightness * 0.1;
    color = adjustVibrance(color, vibrance);
    color = adjustSaturation(color, saturation);
    color = applyVignette(color, uv, resolution);

    color = applyLUT(color);

    // Tone Mapping
    vec3 mappedColor = color;
    if (toneMapping < 0.5) {
        mappedColor = clamp(color, 0.0, 1.0);
        mappedColor = linearToSRGB(mappedColor);
    } else if (toneMapping < 1.5) {
        mappedColor = ACESFilmic(color);
        mappedColor = linearToSRGB(mappedColor);
    } else if (toneMapping < 2.5) {
        mappedColor = AgX(color);
        mappedColor = linearToSRGB(mappedColor); 
    } else if (toneMapping < 3.5) {
        mappedColor = SoftClip(color);
        mappedColor = linearToSRGB(mappedColor);
    } else {
        mappedColor = linearToSRGB(color);
    }
    
    vec3 standardColor = clamp(color, 0.0, 1.0);
    standardColor = linearToSRGB(standardColor);
    color = mix(standardColor, mappedColor, toneStrength);

    color = applyCurves(color, tCurves);

    if (grain > 0.0) {
        float noise = grainNoise(uv, resolution, grainSize, grainRoughness);
        float strength = grain * 0.1; 
        color += (noise - 0.5) * strength;
    }
    return color;
}
`;

export const FRAGMENT_SHADER = `
uniform sampler2D tDiffuse;
uniform sampler2D tCurves;
uniform vec2 resolution;

// Split Screen
uniform int comparisonMode; // 0=off, 1=split, 2=bypass
uniform float splitPosition; // 0.0 - 1.0

// Optics
uniform float distortion;
uniform float chromaticAberration;

varying vec2 vUv;

${GRADING_UTILS}

void main() {
    // 1. Geometric Distortion
    // Applied to UVs first so everything else samples the distorted space
    vec2 uv = vUv;
    
    if (abs(distortion) > 0.001) {
        vec2 center = uv - 0.5;
        float r2 = dot(center, center);
        float f = 1.0 + r2 * (distortion * -0.01); // Negative to match standard barrel/pincushion feel
        uv = center * f + 0.5;
    }

    // 2. Chromatic Aberration (Split RGB samples)
    vec3 baseColor;
    if (chromaticAberration > 0.0) {
        float caAmount = chromaticAberration * 0.005;
        vec2 caOffset = (uv - 0.5) * caAmount;
        
        float r = texture2D(tDiffuse, uv - caOffset).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv + caOffset).b;
        baseColor = vec3(r, g, b);
    } else {
        baseColor = texture2D(tDiffuse, uv).rgb;
    }
    
    vec4 tex = vec4(baseColor, 1.0);
    
    if (comparisonMode == 2) {
        // Bypass
        gl_FragColor = tex;
        return;
    }

    // Pass the modified UV to grading for texture/grain effects to align
    vec3 graded = calculateFinalColor(tex.rgb, uv, resolution, tCurves, tDiffuse);
    
    if (comparisonMode == 1) {
        // Split Screen
        float lineWidth = 0.002;
        if (abs(vUv.x - splitPosition) < lineWidth) {
             gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); 
             return;
        }

        if (vUv.x > splitPosition) {
             gl_FragColor = vec4(graded, tex.a);
        } else {
             gl_FragColor = tex;
        }
    } else {
        gl_FragColor = vec4(graded, tex.a);
    }
}
`;

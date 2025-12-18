
export const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const FRAGMENT_SHADER = `
#define PI 3.14159265359

uniform sampler2D tDiffuse;
uniform sampler2D tCurves; // 256x4 Texture (L, R, G, B)

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

// Effects
uniform float vignette;
uniform float vignetteMidpoint;
uniform float vignetteRoundness;
uniform float vignetteFeather;

uniform float grain;
uniform float grainSize;
uniform float grainRoughness;

uniform float sharpness;
uniform float toneMapping; // 0=Standard, 1=Filmic, 2=AgX, 3=Soft

// Color Grading
uniform vec3 cgShadowsColor; // RGB
uniform vec3 cgMidtonesColor; // RGB
uniform vec3 cgHighlightsColor; // RGB
uniform vec3 cgLumaParams; // x=Shadows, y=Mids, z=Highlights
uniform float cgBlending; // 0-1 (Overlap/Softness)
uniform float cgBalance; // -1 to 1 (Range Shift)

uniform vec2 resolution;

varying vec2 vUv;

// --- UTILS ---

float random(vec2 uv) {
    return fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Improved Noise for Grain
float grainNoise(vec2 uv, float size, float roughness) {
    // Quantize UVs to simulate grain size
    float scale = max(0.1, size);
    vec2 quantUV = floor(uv * resolution / scale) / (resolution / scale);
    float noise = random(quantUV);
    return noise; 
}

// Convert sRGB to Linear
vec3 sRGBToLinear(vec3 color) {
    return pow(color, vec3(2.2));
}

// Convert Linear to sRGB
vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// --- GRADING OPS (Assume Linear Input) ---

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
    
    // Highlights
    float hMask = smoothstep(0.5, 1.0, luma);
    color += color * h * 0.5 * hMask;

    // Shadows
    float sMask = 1.0 - smoothstep(0.0, 0.2, luma);
    color += color * s * 0.3 * sMask;

    // Whites
    color *= (1.0 + w * 0.5);

    // Blacks
    color += b * 0.05;

    return max(vec3(0.0), color);
}

// --- VIGNETTE ---
vec3 applyVignette(vec3 color, vec2 uv) {
    if (vignette <= 0.0) return color;

    vec2 coord = uv - 0.5;
    
    // Roundness: 0 = Oval (Aspect corrected), 1 = Circle
    float aspect = resolution.x / resolution.y;
    vec2 circleCoord = coord;
    // If roundness is 1, we want a perfect circle regardless of aspect, so we scale X by aspect.
    // If roundness is 0, we want it to stretch with the screen (oval), so no aspect fix.
    circleCoord.x *= mix(1.0, aspect, vignetteRoundness); 
    
    float dist = length(circleCoord);
    
    // Midpoint: Controls the size of the clear area.
    // Invert so higher midpoint = larger clear area.
    // Map 0-1 range to a useful radius range. 
    float radius = vignetteMidpoint * 0.7; // Approx scale
    
    // Feather: Softness
    float feather = max(0.01, vignetteFeather);
    
    float mask = smoothstep(radius, radius + feather, dist);
    
    return color * (1.0 - (mask * vignette));
}

// --- 3-WAY COLOR GRADING ---

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


// --- TONE MAPPING ALGORITHMS ---

vec3 SoftClip(vec3 v) {
    vec3 x = max(vec3(0.0), v);
    return min(x, 1.0 - exp(-x * 1.2)); 
}

vec3 ACESFilmic(vec3 v) {
    v *= 1.2; 
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

vec3 AgX(vec3 v) {
    mat3 r = mat3(
        0.842, 0.042, 0.042,
        0.078, 0.878, 0.078,
        0.079, 0.079, 0.879
    );
    vec3 x = r * v;
    x = max(vec3(1e-10), x);
    x = log2(x);
    x = (x + 12.47393) / 16.5;
    x = clamp(x, 0.0, 1.0);
    x = x * x * (3.0 - 2.0 * x); 
    return x * x; 
}

vec3 Reinhard(vec3 v) {
    return v / (v + vec3(1.0));
}

// --- CURVES LOOKUP ---
vec3 applyCurves(vec3 color) {
    float r = texture2D(tCurves, vec2(clamp(color.r, 0.0, 1.0), 0.375)).r;
    float g = texture2D(tCurves, vec2(clamp(color.g, 0.0, 1.0), 0.625)).r;
    float b = texture2D(tCurves, vec2(clamp(color.b, 0.0, 1.0), 0.875)).r;
    vec3 c = vec3(r, g, b);
    c.r = texture2D(tCurves, vec2(c.r, 0.125)).r;
    c.g = texture2D(tCurves, vec2(c.g, 0.125)).r;
    c.b = texture2D(tCurves, vec2(c.b, 0.125)).r;
    return c;
}

void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    // 1. Linearize
    color = sRGBToLinear(color);

    // 2. Grading (Linear)
    color = adjustExposure(color, exposure);
    color = adjustContrast(color, contrast);
    color = adjustTone(color, highlights, shadows, whites, blacks);
    
    // 3-Way Color Grading
    color = applyColorGrading(color);

    color = adjustTempTint(color, temperature, tint);
    color += brightness * 0.1;
    color = adjustVibrance(color, vibrance);
    color = adjustSaturation(color, saturation);

    // Vignette
    color = applyVignette(color, vUv);

    // 3. Tone Mapping (Linear -> sRGB/Display)
    if (toneMapping < 0.5) {
        color = SoftClip(color);
        color = linearToSRGB(color);
    } else if (toneMapping < 1.5) {
        color = ACESFilmic(color);
    } else if (toneMapping < 2.5) {
        color = AgX(color);
        color = linearToSRGB(color); 
    } else {
        color = Reinhard(color);
        color = linearToSRGB(color);
    }

    // 4. Curves
    color = applyCurves(color);

    // 5. Grain (Applied after tone mapping for consistent look)
    if (grain > 0.0) {
        float noise = grainNoise(vUv, grainSize, grainRoughness);
        float strength = grain * 0.1; 
        color += (noise - 0.5) * strength;
    }

    gl_FragColor = vec4(color, tex.a);
}
`;

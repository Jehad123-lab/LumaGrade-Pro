
import * as THREE from 'three';

export const parseCubeLUT = (content: string): { size: number, texture: THREE.Data3DTexture, name: string } | null => {
    try {
        const lines = content.split(/\r?\n/);
        let size = 0;
        let title = "Untitled LUT";
        
        // Extract all numbers from the data area
        const numbers: number[] = [];
        let inData = false;

        for (const line of lines) {
            const l = line.trim();
            if (!l || l.startsWith('#')) continue;

            if (l.startsWith('TITLE')) {
                const parts = l.split('"');
                if (parts.length > 1) title = parts[1];
                continue;
            }
            if (l.startsWith('LUT_3D_SIZE')) {
                const parts = l.split(/\s+/);
                if (parts.length > 1) {
                    size = parseInt(parts[1]);
                }
                continue;
            }
            if (l.startsWith('DOMAIN')) continue;

            // Simple heuristic: if it starts with a number or minus sign, treat as data
            if (/^[0-9.+-]/.test(l)) {
                inData = true;
                const parts = l.split(/\s+/);
                for (const p of parts) {
                    const val = parseFloat(p);
                    if (!isNaN(val)) numbers.push(val);
                }
            }
        }

        if (size === 0) {
            console.error("Invalid LUT: Could not find LUT_3D_SIZE");
            return null;
        }

        const totalPixels = size * size * size;
        if (numbers.length < totalPixels * 3) {
            console.error(`Invalid LUT: Insufficient data points. Expected ${totalPixels * 3}, found ${numbers.length}`);
            return null;
        }

        // RGBA (4 channels) is best for alignment in WebGL 2 usually.
        // We'll use RGB for space if supported, but ThreeJS Data3DTexture often prefers RGBA.
        // Let's use Float32Array RGB first.
        const data = new Float32Array(totalPixels * 4); // RGBA

        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const srcIdx = i * 3;
            
            data[idx] = numbers[srcIdx];
            data[idx + 1] = numbers[srcIdx + 1];
            data[idx + 2] = numbers[srcIdx + 2];
            data[idx + 3] = 1.0; // Alpha
        }

        const texture = new THREE.Data3DTexture(data, size, size, size);
        texture.format = THREE.RGBAFormat;
        texture.type = THREE.FloatType;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.unpackAlignment = 1;
        texture.needsUpdate = true;

        return { size, texture, name: title };

    } catch (e) {
        console.error("Error parsing LUT:", e);
        return null;
    }
};

/**
 * Natural Cubic Spline Interpolation
 * Creates a smooth curve C2 continuous (continuous first and second derivatives).
 * This is preferred for color grading curves over monotone splines as it yields
 * smoother, more organic transitions.
 */
export class MonotoneCubicSpline {
    private xs: number[];
    private ys: number[];
    private ks: number[]; // Second derivatives

    constructor(xs: number[], ys: number[]) {
        this.xs = xs;
        this.ys = ys;

        const n = xs.length;
        
        if (n === 0) {
            this.ks = [];
            return;
        }
        
        if (n === 1) {
            this.ks = [0];
            return;
        }

        // We solve the tridiagonal matrix for the second derivatives (k)
        // Natural spline boundary conditions: k[0] = 0, k[n-1] = 0
        
        const a = new Float64Array(n - 1);
        const b = new Float64Array(n - 1);
        const r = new Float64Array(n - 1);
        
        const dx = new Float64Array(n - 1);
        const dy = new Float64Array(n - 1);
        
        for (let i = 0; i < n - 1; i++) {
            dx[i] = xs[i + 1] - xs[i];
            dy[i] = ys[i + 1] - ys[i];
        }
        
        for (let i = 1; i < n - 1; i++) {
            a[i] = dx[i-1] / 6; // sub-diagonal
            b[i] = (dx[i-1] + dx[i]) / 3; // diagonal
            // c[i] (super-diagonal) is handled implicitly as it's symmetric with 'a' in this formulation structure
            // or we use standard algorithm variables
            
            // Right hand side
            r[i] = (dy[i] / dx[i] - dy[i-1] / dx[i-1]);
        }
        
        // Thomas Algorithm for solving tridiagonal system
        // Since it's natural spline, we only solve for inner points 1 to n-2.
        // k[0] and k[n-1] are 0.
        
        const cPrime = new Float64Array(n);
        const dPrime = new Float64Array(n);
        
        // We will store the solution in ks
        this.ks = new Array(n).fill(0);
        
        // Forward sweep
        // We operate on indices 1 to n-2
        if (n > 2) {
             cPrime[1] = (dx[1] / 6) / ((dx[0] + dx[1]) / 3);
             dPrime[1] = r[1] / ((dx[0] + dx[1]) / 3);
             
             for(let i = 2; i < n - 1; i++) {
                 const denom = ((dx[i-1] + dx[i]) / 3) - (dx[i-1] / 6) * cPrime[i-1];
                 cPrime[i] = (dx[i] / 6) / denom;
                 dPrime[i] = (r[i] - (dx[i-1] / 6) * dPrime[i-1]) / denom;
             }
             
             // Back substitution
             for(let i = n - 2; i >= 1; i--) {
                 this.ks[i] = dPrime[i] - cPrime[i] * this.ks[i+1];
             }
        }
    }

    interpolate(x: number): number {
        const xs = this.xs;
        const ys = this.ys;
        const n = xs.length;

        // Out of bounds - linear extrapolation using the slope at endpoints?
        // For Color Curves, we usually clamp the VALUE (y), or flat extend.
        // Let's flat extend the Y value of endpoints.
        if (x <= xs[0]) return ys[0];
        if (x >= xs[n - 1]) return ys[n - 1];

        // Binary search for segment
        let i = 0;
        let low = 0;
        let high = n - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (xs[mid] <= x) {
                i = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        // Ensure i is not the last element
        if (i >= n - 1) i = n - 2;
        
        const h = xs[i + 1] - xs[i];
        if (h === 0) return ys[i];

        const a = (xs[i + 1] - x) / h;
        const b = (x - xs[i]) / h;
        
        const k = this.ks;
        
        return a * ys[i] + b * ys[i + 1] + 
               ((a * a * a - a) * k[i] + (b * b * b - b) * k[i + 1]) * (h * h) / 6;
    }
}
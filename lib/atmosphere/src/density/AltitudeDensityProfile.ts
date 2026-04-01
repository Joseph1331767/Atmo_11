import { DensityProfileConfig, DensityFalloff } from '../types';

export class AltitudeDensityProfile {
  private config: DensityProfileConfig;

  constructor(config: DensityProfileConfig) {
    this.config = config;
  }

  public getDensityAtAltitude(altitude: number): number {
    let totalDensity = 0;

    for (const layer of this.config.layers) {
      if (altitude >= layer.altitudeStart && altitude <= layer.altitudeEnd) {
        const layerThickness = layer.altitudeEnd - layer.altitudeStart;
        const normalizedAltitude = (altitude - layer.altitudeStart) / layerThickness;

        switch (layer.falloff) {
          case DensityFalloff.CONSTANT:
            totalDensity += layer.peakDensity;
            break;
          case DensityFalloff.LINEAR:
            totalDensity += layer.peakDensity * (1 - normalizedAltitude);
            break;
          case DensityFalloff.EXPONENTIAL:
            if (layer.scaleHeight) {
              totalDensity += layer.peakDensity * Math.exp(-(altitude - layer.altitudeStart) / layer.scaleHeight);
            }
            break;
          case DensityFalloff.SMOOTHSTEP:
            const t = Math.max(0, Math.min(1, 1 - normalizedAltitude));
            totalDensity += layer.peakDensity * (t * t * (3 - 2 * t));
            break;
          case DensityFalloff.BAND:
            const midPoint = layer.altitudeStart + layerThickness / 2;
            const dist = Math.abs(altitude - midPoint) / (layerThickness / 2);
            totalDensity += layer.peakDensity * Math.exp(-(dist * dist) * 4);
            break;
        }
      }
    }

    return Math.min(1, Math.max(0, totalDensity));
  }

  public getOpticalDepthAtAltitude(altitude: number): number {
    // Simplified optical depth calculation
    let opticalDepth = 0;
    const steps = 10;
    const maxAltitude = Math.max(...this.config.layers.map(l => l.altitudeEnd));
    
    if (altitude >= maxAltitude) return 0;

    const stepSize = (maxAltitude - altitude) / steps;
    for (let i = 0; i < steps; i++) {
      const currentAlt = altitude + i * stepSize;
      opticalDepth += this.getDensityAtAltitude(currentAlt) * stepSize;
    }

    return opticalDepth * this.config.totalOpticalDepth;
  }
}

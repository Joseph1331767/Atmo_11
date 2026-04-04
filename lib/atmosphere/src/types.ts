export enum BlendMode {
  ALPHA = 'ALPHA',
  ADDITIVE = 'ADDITIVE',
  PREMULTIPLIED = 'PREMULTIPLIED',
}

export enum AtmosphereBackend {
  WGSL = 'WGSL',
  GLSL = 'GLSL',
  AUTO = 'AUTO',
}

export enum DensityFalloff {
  EXPONENTIAL = 'EXPONENTIAL',
  CONSTANT = 'CONSTANT',
  LINEAR = 'LINEAR',
  SMOOTHSTEP = 'SMOOTHSTEP',
  BAND = 'BAND',
}

export interface DensityLayer {
  altitudeStart: number;
  altitudeEnd: number;
  peakDensity: number;
  falloff: DensityFalloff;
  scaleHeight?: number;
}

export interface DensityProfileConfig {
  layers: DensityLayer[];
  totalOpticalDepth: number;
}

export interface SunConfig {
  direction: [number, number, number];
  intensity: number;
  color: [number, number, number];
}

export interface AtmosphereConfig {
  planetRadius: number;
  atmosphereHeightRatio: number;
  glowEffectScale: number;
  shellSegments: number;
  shellSubdivisions: number;

  shellOpacity: number;
  blendMode: BlendMode;
  depthWrite: boolean;
  backFaceCulling: boolean;
  useLogarithmicDepth: boolean;

  densityProfile: DensityProfileConfig;
  suns: SunConfig[];

  // Physically based scattering parameters
  rayleighScattering: [number, number, number];
  mieScattering: number;
  rayleighScaleHeight: number;
  mieScaleHeight: number;
  mieG: number;
  rayMarchSteps: number;
  lightSteps: number;

  // Legacy/Artistic colors (can be used to tint the scattering)
  highAngleColor: [number, number, number];
  lowAngleColor: [number, number, number];

  // Aurora parameters
  sunParticleIntensity: number;
  planetMagneticEffect: number;
  auroraEffectIntensity: number;
  auroraHeightScale: number;
  auroraVariance: number;

  // Occlusion parameters
  darkSideOcclusion: number;

  customUniforms: Record<string, number | number[]>;

  shellVertexSource?: string;
  shellFragmentSource?: string;

  renderOrder: number;
}

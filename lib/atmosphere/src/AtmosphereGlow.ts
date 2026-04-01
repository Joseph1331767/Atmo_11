import { Scene, Engine, AbstractMesh, Vector3, ShaderMaterial, Mesh } from '@babylonjs/core';
import { AtmosphereConfig, AtmosphereBackend, BlendMode, DensityFalloff, SunConfig } from './types';
import { IAtmosphereBackend, FrameData } from './backends/BackendInterface';
import { WGSLBackend } from './backends/wgsl/WGSLBackend';
import { GLSLBackend } from './backends/glsl/GLSLBackend';
import { AltitudeDensityProfile } from './density/AltitudeDensityProfile';
import { ShellGeometry } from './geometry/ShellGeometry';

const DEFAULT_CONFIG: AtmosphereConfig = {
  planetRadius: 5.0,
  atmosphereHeightRatio: 0.08,
  glowEffectScale: 2.0,
  shellSegments: 64,
  shellSubdivisions: 1,
  shellOpacity: 1.0,
  blendMode: BlendMode.ALPHA,
  depthWrite: false,
  backFaceCulling: false,
  useLogarithmicDepth: true,
  densityProfile: {
    layers: [
      {
        altitudeStart: 0,
        altitudeEnd: 0.08 * 5.0,
        peakDensity: 1.0,
        falloff: DensityFalloff.EXPONENTIAL,
        scaleHeight: 0.02 * 5.0,
      }
    ],
    totalOpticalDepth: 1.0,
  },
  suns: [
    {
      direction: [1, 0, 0],
      intensity: 1.0,
      color: [1, 1, 1],
    }
  ],
  rayleighScattering: [0.0058, 0.0135, 0.0331], // Earth-like Rayleigh
  mieScattering: 0.0021, // Earth-like Mie
  rayleighScaleHeight: 0.02 * 5.0, // 8km on Earth
  mieScaleHeight: 0.003 * 5.0, // 1.2km on Earth
  mieG: 0.758,
  rayMarchSteps: 32,
  lightSteps: 8,
  highAngleColor: [0.1, 0.3, 0.8],
  lowAngleColor: [0.8, 0.3, 0.1],
  sunParticleIntensity: 1.0,
  planetMagneticEffect: 1.0,
  auroraEffectIntensity: 0.0,
  auroraHeightScale: 1.0,
  auroraVariance: 1.0,
  customUniforms: {},
  renderOrder: 100,
};

export class AtmosphereGlow {
  private scene: Scene;
  private engine: Engine;
  private config: AtmosphereConfig;
  private backend: IAtmosphereBackend;
  private densityProfile: AltitudeDensityProfile;
  
  private targetMesh: AbstractMesh | null = null;
  private shellMesh: Mesh | null = null;
  private material: ShaderMaterial | null = null;
  
  private elapsedTime: number = 0;
  private disposed: boolean = false;
  private visible: boolean = true;

  constructor(
    scene: Scene,
    engine: Engine,
    config?: Partial<AtmosphereConfig>,
    backend: AtmosphereBackend = AtmosphereBackend.AUTO
  ) {
    this.scene = scene;
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Auto-detect backend if needed
    if (backend === AtmosphereBackend.AUTO) {
      this.backend = engine.isWebGPU ? new WGSLBackend() : new GLSLBackend();
    } else if (backend === AtmosphereBackend.WGSL) {
      this.backend = new WGSLBackend();
    } else {
      this.backend = new GLSLBackend();
    }

    this.densityProfile = new AltitudeDensityProfile(this.config.densityProfile);
  }

  public attach(targetMesh: AbstractMesh): void {
    if (this.disposed) return;
    
    this.detach();
    this.targetMesh = targetMesh;

    const innerRadius = this.config.planetRadius;
    // Inflate the mesh to accommodate aurora which stretches further than the atmosphere
    // Max aurora height is roughly 4.0 * maxHeightScale(2.0) * maxMagneticEffect(5.0) = 40.0
    const maxRadiusRatio = Math.max(this.config.atmosphereHeightRatio, this.config.atmosphereHeightRatio * 50.0);
    const outerRadius = innerRadius * (1 + maxRadiusRatio) * 1.05;

    this.shellMesh = ShellGeometry.create('atmosphereShell', {
      innerRadius,
      outerRadius,
      segments: this.config.shellSegments,
      radialSubdivisions: this.config.shellSubdivisions,
    }, this.scene);

    this.shellMesh.parent = this.targetMesh;
    this.shellMesh.renderingGroupId = this.config.renderOrder > 0 ? 1 : 0; // Simplified render order
    this.shellMesh.isVisible = this.visible;

    this.material = this.backend.createShellMaterial(this.scene, this.config);
    this.shellMesh.material = this.material;
  }

  public detach(): void {
    if (this.shellMesh) {
      this.shellMesh.parent = null;
      this.shellMesh.dispose();
      this.shellMesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.targetMesh = null;
  }

  public update(deltaTime: number, cameraPosition: Vector3, suns?: SunConfig[]): void {
    if (this.disposed || !this.material || !this.visible) return;

    this.elapsedTime += deltaTime;
    
    const activeSuns = suns || this.config.suns;
    const screenRatio = this.engine.getRenderWidth() / this.engine.getRenderHeight();

    const frameData: FrameData = {
      elapsedTime: this.elapsedTime,
      deltaTime,
      cameraPosition,
      suns: activeSuns,
      screenRatio,
    };

    this.backend.updateUniforms(this.material, this.config, frameData);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.detach();
    this.backend.dispose();
    this.disposed = true;
  }

  public isDisposed(): boolean {
    return this.disposed;
  }

  public getDensityAtAltitude(altitude: number): number {
    return this.densityProfile.getDensityAtAltitude(altitude);
  }

  public getOpticalDepthAtAltitude(altitude: number): number {
    return this.densityProfile.getOpticalDepthAtAltitude(altitude);
  }

  public getAtmosphereHeight(): number {
    return this.config.planetRadius * this.config.atmosphereHeightRatio;
  }

  public getAtmosphereRadius(): number {
    return this.config.planetRadius * (1 + this.config.atmosphereHeightRatio);
  }

  public updateConfig(partial: Partial<AtmosphereConfig>): void {
    this.config = { ...this.config, ...partial };

    if (partial.densityProfile) {
      this.densityProfile = new AltitudeDensityProfile(this.config.densityProfile);
    }

    // If geometry-related config changed, we need to rebuild the shell
    if (
      partial.planetRadius !== undefined ||
      partial.atmosphereHeightRatio !== undefined ||
      partial.shellSegments !== undefined ||
      partial.shellSubdivisions !== undefined
    ) {
      if (this.targetMesh) {
        const target = this.targetMesh;
        this.attach(target);
      }
    } else if (this.material) {
      // Just update material properties if it exists
      this.material.backFaceCulling = this.config.backFaceCulling;
      this.material.depthWrite = this.config.depthWrite;
    }
  }

  public getConfig(): Readonly<AtmosphereConfig> {
    return this.config;
  }

  public setCustomUniforms(uniforms: Record<string, number | number[]>): void {
    this.config.customUniforms = { ...this.config.customUniforms, ...uniforms };
  }

  public setShaderSource(vertex?: string, fragment?: string): void {
    if (vertex) this.config.shellVertexSource = vertex;
    if (fragment) this.config.shellFragmentSource = fragment;

    if (this.material && this.shellMesh) {
      const oldMaterial = this.material;
      this.material = this.backend.rebuildMaterial(this.scene, this.config, vertex, fragment);
      this.shellMesh.material = this.material;
      oldMaterial.dispose();
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.shellMesh) {
      this.shellMesh.isVisible = visible;
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }
}

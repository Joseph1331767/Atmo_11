import { Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
import { AtmosphereConfig, SunConfig } from '../types';

export interface FrameData {
  elapsedTime: number;
  deltaTime: number;
  cameraPosition: Vector3;
  suns: SunConfig[];
  screenRatio: number;
}

export interface IAtmosphereBackend {
  registerShaders(vertexOverride?: string, fragmentOverride?: string): void;
  createShellMaterial(scene: Scene, config: AtmosphereConfig): ShaderMaterial;
  updateUniforms(material: ShaderMaterial, config: AtmosphereConfig, frame: FrameData): void;
  rebuildMaterial(scene: Scene, config: AtmosphereConfig, vertex?: string, fragment?: string): ShaderMaterial;
  dispose(): void;
}

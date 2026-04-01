import { Scene, ShaderMaterial, Vector3, Vector2, Vector4, ShaderLanguage, ShaderStore } from '@babylonjs/core';
import { IAtmosphereBackend, FrameData } from '../BackendInterface';
import { AtmosphereConfig } from '../../types';
import { shellVertexWGSL, shellFragmentWGSL } from './shaders/shell.wgsl';

export class WGSLBackend implements IAtmosphereBackend {
  public registerShaders(vertexOverride?: string, fragmentOverride?: string): void {
    const vertex = vertexOverride || shellVertexWGSL;
    const fragment = fragmentOverride || shellFragmentWGSL;

    ShaderStore.ShadersStoreWGSL['atmoGlow_shellVertexShader'] = vertex;
    ShaderStore.ShadersStoreWGSL['atmoGlow_shellFragmentShader'] = fragment;
  }

  public createShellMaterial(scene: Scene, config: AtmosphereConfig): ShaderMaterial {
    this.registerShaders(config.shellVertexSource, config.shellFragmentSource);

    const material = new ShaderMaterial(
      'atmosphereShellMaterial',
      scene,
      {
        vertex: 'atmoGlow_shell',
        fragment: 'atmoGlow_shell',
      },
      {
        attributes: ['position', 'normal', 'uv'],
        uniforms: [
          'planetRadius',
          'atmosphereRadius',
          'atmosphereHeight',
          'cameraPosition',
          'sunCount',
          'sunDirections',
          'sunIntensities',
          'sunColors',
          'rayleighScattering',
          'mieScattering',
          'rayleighScaleHeight',
          'mieScaleHeight',
          'mieG',
          'rayMarchSteps',
          'lightSteps',
          'highAngleColor',
          'lowAngleColor',
          'sunParticleIntensity',
          'planetMagneticEffect',
          'auroraEffectIntensity',
          'auroraHeightScale',
          'auroraVariance',
          'glowEffectScale',
          'shellOpacity',
          'time',
          'deltaTime',
          'screenRatio',
          'densityLayerCount',
          'totalOpticalDepth',
        ],
        uniformBuffers: ['Scene', 'Mesh'],
        shaderLanguage: ShaderLanguage.WGSL,
      }
    );

    material.backFaceCulling = config.backFaceCulling;
    material.depthWrite = config.depthWrite;
    material.alphaMode = this.getAlphaMode(config.blendMode, scene);
    material.needDepthPrePass = true;
    material.needAlphaBlending = () => true;
    material.needAlphaTesting = () => false;

    return material;
  }

  public updateUniforms(material: ShaderMaterial, config: AtmosphereConfig, frame: FrameData): void {
    material.setFloat('planetRadius', config.planetRadius);
    material.setFloat('atmosphereRadius', config.planetRadius * (1 + config.atmosphereHeightRatio));
    material.setFloat('atmosphereHeight', config.planetRadius * config.atmosphereHeightRatio);
    material.setVector3('cameraPosition', frame.cameraPosition);
    
    material.setInt('sunCount', Math.min(frame.suns.length, 4));
    
    const sunDirections = new Float32Array(16);
    const sunColors = new Float32Array(16);
    let sunIntensitiesVec = new Vector4(0, 0, 0, 0);
    
    for (let i = 0; i < 4; i++) {
      if (i < frame.suns.length) {
        const sun = frame.suns[i];
        sunDirections[i * 4] = sun.direction[0];
        sunDirections[i * 4 + 1] = sun.direction[1];
        sunDirections[i * 4 + 2] = sun.direction[2];
        sunDirections[i * 4 + 3] = 0;
        
        if (i === 0) sunIntensitiesVec.x = sun.intensity;
        if (i === 1) sunIntensitiesVec.y = sun.intensity;
        if (i === 2) sunIntensitiesVec.z = sun.intensity;
        if (i === 3) sunIntensitiesVec.w = sun.intensity;
        
        sunColors[i * 4] = sun.color[0];
        sunColors[i * 4 + 1] = sun.color[1];
        sunColors[i * 4 + 2] = sun.color[2];
        sunColors[i * 4 + 3] = 1;
      } else {
        sunDirections[i * 4] = 0;
        sunDirections[i * 4 + 1] = 1;
        sunDirections[i * 4 + 2] = 0;
        sunDirections[i * 4 + 3] = 0;
        sunColors[i * 4] = 0;
        sunColors[i * 4 + 1] = 0;
        sunColors[i * 4 + 2] = 0;
        sunColors[i * 4 + 3] = 1;
      }
    }
    
    material.setArray4('sunDirections', Array.from(sunDirections));
    material.setVector4('sunIntensities', sunIntensitiesVec);
    material.setArray4('sunColors', Array.from(sunColors));
    
    material.setVector3('rayleighScattering', new Vector3(config.rayleighScattering[0], config.rayleighScattering[1], config.rayleighScattering[2]));
    material.setFloat('mieScattering', config.mieScattering);
    material.setFloat('rayleighScaleHeight', config.rayleighScaleHeight);
    material.setFloat('mieScaleHeight', config.mieScaleHeight);
    material.setFloat('mieG', config.mieG);
    material.setInt('rayMarchSteps', config.rayMarchSteps);
    material.setInt('lightSteps', config.lightSteps);

    material.setVector3('highAngleColor', new Vector3(config.highAngleColor[0], config.highAngleColor[1], config.highAngleColor[2]));
    material.setVector3('lowAngleColor', new Vector3(config.lowAngleColor[0], config.lowAngleColor[1], config.lowAngleColor[2]));
    
    material.setFloat('sunParticleIntensity', config.sunParticleIntensity ?? 1.0);
    material.setFloat('planetMagneticEffect', config.planetMagneticEffect ?? 1.0);
    material.setFloat('auroraEffectIntensity', config.auroraEffectIntensity ?? 0.0);
    material.setFloat('auroraHeightScale', config.auroraHeightScale ?? 1.0);
    material.setFloat('auroraVariance', config.auroraVariance ?? 1.0);

    material.setFloat('glowEffectScale', config.glowEffectScale);
    material.setFloat('shellOpacity', config.shellOpacity);
    material.setFloat('time', frame.elapsedTime);
    material.setFloat('deltaTime', frame.deltaTime);
    material.setFloat('screenRatio', frame.screenRatio);
    material.setInt('densityLayerCount', config.densityProfile.layers.length);
    material.setFloat('totalOpticalDepth', config.densityProfile.totalOpticalDepth);

    // Custom uniforms
    if (config.customUniforms) {
      for (const [key, value] of Object.entries(config.customUniforms)) {
        if (typeof value === 'number') {
          material.setFloat(key, value);
        } else if (Array.isArray(value)) {
          if (value.length === 2) material.setVector2(key, new Vector2(value[0], value[1]));
          else if (value.length === 3) material.setVector3(key, new Vector3(value[0], value[1], value[2]));
          else if (value.length === 4) material.setVector4(key, new Vector4(value[0], value[1], value[2], value[3]));
          else material.setFloats(key, value);
        }
      }
    }
  }

  public rebuildMaterial(scene: Scene, config: AtmosphereConfig, vertex?: string, fragment?: string): ShaderMaterial {
    this.registerShaders(vertex, fragment);
    return this.createShellMaterial(scene, config);
  }

  public dispose(): void {
    // Cleanup if needed
  }

  private getAlphaMode(blendMode: string, scene: Scene): number {
    const engine = scene.getEngine();
    switch (blendMode) {
      case 'ADDITIVE':
        return 1; // BABYLON.Engine.ALPHA_ADD
      case 'PREMULTIPLIED':
        return 7; // BABYLON.Engine.ALPHA_PREMULTIPLIED
      case 'ALPHA':
      default:
        return 2; // BABYLON.Engine.ALPHA_COMBINE
    }
  }
}

# @planet/atmosphere

An isolated, portable library that wraps any spherical Babylon.js mesh with an atmospheric glow shell.

## Features

1. **Shell geometry** — An auto-generated mesh that envelops a target sphere.
2. **A shader material pipeline** — Dual backend implementations (WGSL + GLSL) with a standard uniform delivery system.
3. **An altitude density data model** — A configurable multi-layer density profile, queryable at any altitude by any external system.
4. **Custom shader injection** — The fragment and vertex source can be replaced entirely, while the library continues to guarantee all standard uniforms remain bound and delivered.

## Installation

This library is designed to be portable. Simply copy the \`src\` folder into your project.

### Dependencies

- \`@babylonjs/core\` ^8.56.0
- \`typescript\` ^5.9

## Usage

### Basic Setup

\`\`\`typescript
import { Scene, Engine, MeshBuilder, Vector3 } from '@babylonjs/core';
import { AtmosphereGlow, AtmosphereBackend } from '@planet/atmosphere';

// 1. Create your Babylon scene and engine
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// 2. Create the target planet mesh
const planet = MeshBuilder.CreateSphere('planet', { diameter: 10, segments: 64 }, scene);

// 3. Initialize the AtmosphereGlow instance
const atmosphere = new AtmosphereGlow(scene, engine, {
  planetRadius: 5.0,
  atmosphereHeightRatio: 0.08,
  glowEffectScale: 2.0,
  shellOpacity: 1.0,
  suns: [
    {
      direction: [1, 0, 0],
      intensity: 1.0,
      color: [1, 1, 1],
    }
  ]
}, AtmosphereBackend.AUTO);

// 4. Attach the atmosphere to the planet
atmosphere.attach(planet);

// 5. Update the atmosphere in your render loop
scene.onBeforeRenderObservable.add(() => {
  const deltaTime = engine.getDeltaTime() / 1000;
  const cameraPosition = scene.activeCamera ? scene.activeCamera.position : Vector3.Zero();
  
  atmosphere.update(deltaTime, cameraPosition);
});
\`\`\`

### Configuration Parameters

The \`AtmosphereConfig\` interface defines the parameters for the atmosphere:

- \`planetRadius\`: Inner sphere radius (Babylon units).
- \`atmosphereHeightRatio\`: Ratio above \`planetRadius\` for the mesh shell.
- \`glowEffectScale\`: Scale factor of how high up off the surface the visual effect happens.
- \`shellSegments\`: Mesh tessellation.
- \`shellSubdivisions\`: Concentric shells for volumetric approximation.
- \`shellOpacity\`: Base alpha [0..1].
- \`blendMode\`: Blend mode for the material (\`ALPHA\`, \`ADDITIVE\`, \`PREMULTIPLIED\`).
- \`depthWrite\`: Whether the material writes to the depth buffer.
- \`backFaceCulling\`: Whether to cull back faces.
- \`useLogarithmicDepth\`: Whether to use logarithmic depth.
- \`densityProfile\`: Density profile configuration.
- \`suns\`: Array of light sources.
- \`highAngleColor\`: RGB base color for high angle band.
- \`lowAngleColor\`: RGB base color for low angle band.
- \`customUniforms\`: Arbitrary key-value pairs passed through to the shader material.
- \`shellVertexSource\`: Custom vertex shader source.
- \`shellFragmentSource\`: Custom fragment shader source.
- \`renderOrder\`: Babylon mesh render order.

### Density Queries

You can query the density profile at any altitude:

\`\`\`typescript
const density = atmosphere.getDensityAtAltitude(0.5);
const opticalDepth = atmosphere.getOpticalDepthAtAltitude(0.5);
\`\`\`

### Custom Shaders

You can inject custom shaders while still receiving the standard uniforms:

\`\`\`typescript
atmosphere.setShaderSource(customVertexShader, customFragmentShader);
\`\`\`

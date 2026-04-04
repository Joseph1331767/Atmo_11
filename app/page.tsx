'use client';

import { useEffect, useRef, useState } from 'react';
import { Engine, Scene, Vector3, HemisphericLight, MeshBuilder, ArcRotateCamera, Color4, DirectionalLight, StandardMaterial, Color3, Texture } from '@babylonjs/core';
import { AtmosphereGlow } from '@/lib/atmosphere/src/AtmosphereGlow';
import { AtmosphereBackend, BlendMode, DensityFalloff } from '@/lib/atmosphere/src/types';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initInProgress = useRef(false);
  const [altitude, setAltitude] = useState<number>(0.04);
  const [atmosphere, setAtmosphere] = useState<AtmosphereGlow | null>(null);
  const [backendType, setBackendType] = useState<AtmosphereBackend>(AtmosphereBackend.WGSL);
  
  // Atmosphere Parameters
  const [rayleighScattering, setRayleighScattering] = useState<[number, number, number]>([0.0058, 0.0135, 0.0331]);
  const [mieScattering, setMieScattering] = useState<number>(0.0021);
  const [rayleighScaleHeight, setRayleighScaleHeight] = useState<number>(0.1);
  const [mieScaleHeight, setMieScaleHeight] = useState<number>(0.015);
  const [glowEffectScale, setGlowEffectScale] = useState<number>(2.0); // Exposure
  const [rayMarchSteps, setRayMarchSteps] = useState<number>(32);
  
  // Aurora Parameters
  const [sunParticleIntensity, setSunParticleIntensity] = useState<number>(1.0);
  const [planetMagneticEffect, setPlanetMagneticEffect] = useState<number>(1.0);
  const [auroraEffectIntensity, setAuroraEffectIntensity] = useState<number>(0.0);
  const [auroraHeightScale, setAuroraHeightScale] = useState<number>(1.0);
  const [auroraVariance, setAuroraVariance] = useState<number>(1.0);

  const [isZoomedOut, setIsZoomedOut] = useState<boolean>(false);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const planetMatRef = useRef<StandardMaterial | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const textureUrlRef = useRef<string | null>(null);
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const [sunLightIntensity, setSunLightIntensity] = useState<number>(0.8);
  const dirLightRef = useRef<DirectionalLight | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTextureUrl(url);
      textureUrlRef.current = url;
      if (planetMatRef.current && sceneRef.current) {
        const texture = new Texture(url, sceneRef.current);
        planetMatRef.current.diffuseTexture = texture;
        planetMatRef.current.diffuseColor = new Color3(1, 1, 1);
      }
    }
  };

  // Update atmosphere when parameters change
  useEffect(() => {
    if (atmosphere) {
      atmosphere.updateConfig({
        rayleighScattering,
        mieScattering,
        rayleighScaleHeight,
        mieScaleHeight,
        glowEffectScale,
        rayMarchSteps,
        sunParticleIntensity,
        planetMagneticEffect,
        auroraEffectIntensity,
        auroraHeightScale,
        auroraVariance,
      });
    }
  }, [rayleighScattering, mieScattering, rayleighScaleHeight, mieScaleHeight, glowEffectScale, rayMarchSteps, sunParticleIntensity, planetMagneticEffect, auroraEffectIntensity, auroraHeightScale, auroraVariance, atmosphere]);

  useEffect(() => {
    if (dirLightRef.current) {
      dirLightRef.current.intensity = sunLightIntensity;
    }
  }, [sunLightIntensity]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let engine: Engine | null = null;
    let scene: Scene | null = null;
    let atmo: AtmosphereGlow | null = null;
    let isMounted = true;

    const initEngine = async () => {
      if (initInProgress.current) return;
      initInProgress.current = true;
      setErrorMsg(null);
      let actualBackend = backendType;
      try {
        let createdEngine: Engine | undefined;
        let useWebGPU = backendType === AtmosphereBackend.WGSL;
        
        if (useWebGPU) {
          if (!navigator.gpu) throw new Error("WebGPU not supported by browser");
          
          let adapter = null;
          // Try requesting the adapter multiple times. Browsers sometimes temporarily 
          // block WebGPU adapter creation if too many contexts were created rapidly during HMR.
          for (let i = 0; i < 4; i++) {
            adapter = await navigator.gpu.requestAdapter();
            if (adapter) break;
            console.warn(`WebGPU adapter request returned null, retrying in 500ms... (Attempt ${i + 1})`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          if (!adapter) {
            throw new Error("No WebGPU adapter found. Your browser has likely temporarily blocked WebGPU due to rapid hot-reloads (context exhaustion). Please refresh your entire browser tab to clear the GPU memory.");
          }
          
          // @ts-ignore
          const { WebGPUEngine } = await import('@babylonjs/core');
          createdEngine = new WebGPUEngine(canvasRef.current as HTMLCanvasElement, { antialias: true }) as any;
          await (createdEngine as any).initAsync();
        } else {
          try {
            createdEngine = new Engine(canvasRef.current as HTMLCanvasElement, true);
            actualBackend = AtmosphereBackend.GLSL;
          } catch (e: any) {
            throw new Error(`WebGL not supported: ${e.message || e}`);
          }
        }

        if (!isMounted || !createdEngine) {
          if (createdEngine) createdEngine.dispose();
          return;
        }

        engine = createdEngine;
        scene = new Scene(engine);
      scene.clearColor = new Color4(0.0, 0.0, 0.0, 1.0);

      const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 15, Vector3.Zero(), scene);
      camera.attachControl(canvasRef.current, true);
      camera.wheelPrecision = 50;
      camera.maxZ = 1000; // Allow seeing the sun
      cameraRef.current = camera;

      const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
      light.intensity = 0.02;
      light.groundColor = new Color3(0.02, 0.02, 0.02);

      const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -0.5, -1), scene);
      dirLight.intensity = sunLightIntensity;
      dirLightRef.current = dirLight;

      const planetRadius = 5.0;
      const planet = MeshBuilder.CreateSphere("planet", { diameter: planetRadius * 2, segments: 64 }, scene);
      
      const planetMat = new StandardMaterial("planetMat", scene);
      if (textureUrlRef.current) {
        const texture = new Texture(textureUrlRef.current, scene);
        planetMat.diffuseTexture = texture;
        planetMat.diffuseColor = new Color3(1, 1, 1);
      } else {
        planetMat.diffuseColor = new Color3(0.2, 0.4, 0.3);
      }
      planetMat.specularColor = new Color3(0.1, 0.1, 0.1);
      planet.material = planetMat;
      planetMatRef.current = planetMat;
      sceneRef.current = scene;

      // Add a visual sun mesh
      const sunMesh = MeshBuilder.CreateSphere("sunMesh", { diameter: 2.0, segments: 32 }, scene);
      const sunMat = new StandardMaterial("sunMat", scene);
      sunMat.emissiveColor = new Color3(1, 0.9, 0.8);
      sunMat.disableLighting = true;
      sunMesh.material = sunMat;
      // Position sun far away along the light direction
      sunMesh.position = new Vector3(1, 0.5, 1).normalize().scale(100);

      atmo = new AtmosphereGlow(scene, engine, {
        planetRadius: planetRadius,
        atmosphereHeightRatio: 0.1,
        glowEffectScale: 2.5,
        shellOpacity: 0.8,
        blendMode: BlendMode.ALPHA,
        suns: [
          {
            direction: [-1, -0.5, -1],
            intensity: 1.0,
            color: [1, 0.9, 0.8],
          }
        ],
        highAngleColor: [0.2, 0.5, 1.0],
        lowAngleColor: [1.0, 0.4, 0.2],
        densityProfile: {
          layers: [
            {
              altitudeStart: 0,
              altitudeEnd: planetRadius * 0.1,
              peakDensity: 1.0,
              falloff: DensityFalloff.EXPONENTIAL,
              scaleHeight: planetRadius * 0.02,
            }
          ],
          totalOpticalDepth: 1.0,
        }
      }, actualBackend);

      atmo.attach(planet);
      setAtmosphere(atmo);

      engine.runRenderLoop(() => {
        if (!engine || !atmo || !scene) return;
        const deltaTime = engine.getDeltaTime() / 1000;
        atmo.update(deltaTime, camera.position);
        scene.render();
      });

      const handleResize = () => {
        if (engine) engine.resize();
      };
      window.addEventListener('resize', handleResize);
      } catch (e: any) {
        console.error("Engine init failed:", e);
        setErrorMsg(e.message || "Failed to initialize engine");
      }
    };

    initEngine();

    return () => {
      isMounted = false;
      initInProgress.current = false;
      window.removeEventListener('resize', () => engine?.resize());
      if (atmo) atmo.dispose();
      if (scene) scene.dispose();
      if (engine) engine.dispose();
    };
  }, [backendType, sunLightIntensity]);

  const density = atmosphere ? atmosphere.getDensityAtAltitude(altitude) : 0;
  const opticalDepth = atmosphere ? atmosphere.getOpticalDepthAtAltitude(altitude) : 0;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
        <h1 className="text-xl font-bold tracking-tight">@planet/atmosphere Demo</h1>
        <div className="text-sm text-gray-400">Babylon.js + Next.js</div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 p-6 bg-gray-900 border-r border-gray-800 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Library Spec</h2>
            <p className="text-sm text-gray-300 mb-2">
              Isolated, portable library that wraps any spherical Babylon.js mesh with an atmospheric glow shell.
            </p>
            <ul className="text-xs text-gray-400 list-disc pl-4 space-y-1">
              <li>WGSL (WebGPU) & GLSL (WebGL2) Backends</li>
              <li>Altitude Density Data Model</li>
              <li>Custom Shader Injection</li>
            </ul>
          </div>

          <div className="h-px bg-gray-800 w-full"></div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Planet Texture</h2>
            <label className="block w-full py-2 text-xs font-semibold rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-center cursor-pointer border border-gray-700">
              {textureUrl ? "Change Texture" : "Upload Equirectangular Map"}
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">
              Applies a diffuse texture to the sphere.
            </p>
          </div>

          <div className="h-px bg-gray-800 w-full"></div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Lighting</h2>
            <div>
              <label className="flex justify-between text-xs mb-1">
                <span>Sun Intensity</span>
                <span className="font-mono text-yellow-400">{sunLightIntensity.toFixed(2)}</span>
              </label>
              <input 
                type="range" min="0" max="5.0" step="0.1" 
                value={sunLightIntensity} 
                onChange={(e) => setSunLightIntensity(parseFloat(e.target.value))}
                className="w-full accent-yellow-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Adjusts the directional light illuminating the planet surface.
            </p>
          </div>

          <div className="h-px bg-gray-800 w-full"></div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Backend</h2>
            <div className="flex gap-2">
              <button 
                className={`flex-1 py-1.5 text-xs font-semibold rounded ${backendType === AtmosphereBackend.WGSL ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                onClick={() => setBackendType(AtmosphereBackend.WGSL)}
              >
                WGSL
              </button>
              <button 
                className={`flex-1 py-1.5 text-xs font-semibold rounded ${backendType === AtmosphereBackend.GLSL ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                onClick={() => setBackendType(AtmosphereBackend.GLSL)}
              >
                GLSL
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Forces specific shader backend. No fallback in this demo.
            </p>
          </div>

          <div className="h-px bg-gray-800 w-full"></div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Atmosphere Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Rayleigh R</span>
                  <span className="font-mono text-blue-400">{rayleighScattering[0].toFixed(4)}</span>
                </label>
                <input 
                  type="range" min="0" max="0.05" step="0.0001" 
                  value={rayleighScattering[0]} 
                  onChange={(e) => setRayleighScattering([parseFloat(e.target.value), rayleighScattering[1], rayleighScattering[2]])}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Rayleigh G</span>
                  <span className="font-mono text-blue-400">{rayleighScattering[1].toFixed(4)}</span>
                </label>
                <input 
                  type="range" min="0" max="0.05" step="0.0001" 
                  value={rayleighScattering[1]} 
                  onChange={(e) => setRayleighScattering([rayleighScattering[0], parseFloat(e.target.value), rayleighScattering[2]])}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Rayleigh B</span>
                  <span className="font-mono text-blue-400">{rayleighScattering[2].toFixed(4)}</span>
                </label>
                <input 
                  type="range" min="0" max="0.05" step="0.0001" 
                  value={rayleighScattering[2]} 
                  onChange={(e) => setRayleighScattering([rayleighScattering[0], rayleighScattering[1], parseFloat(e.target.value)])}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Mie Scattering</span>
                  <span className="font-mono text-blue-400">{mieScattering.toFixed(4)}</span>
                </label>
                <input 
                  type="range" min="0" max="0.02" step="0.0001" 
                  value={mieScattering} 
                  onChange={(e) => setMieScattering(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Rayleigh Scale Height</span>
                  <span className="font-mono text-blue-400">{rayleighScaleHeight.toFixed(3)}</span>
                </label>
                <input 
                  type="range" min="0.01" max="0.5" step="0.01" 
                  value={rayleighScaleHeight} 
                  onChange={(e) => setRayleighScaleHeight(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Exposure (Glow Scale)</span>
                  <span className="font-mono text-blue-400">{glowEffectScale.toFixed(2)}</span>
                </label>
                <input 
                  type="range" min="0.1" max="10.0" step="0.1" 
                  value={glowEffectScale} 
                  onChange={(e) => setGlowEffectScale(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Raymarch Steps</span>
                  <span className="font-mono text-blue-400">{rayMarchSteps}</span>
                </label>
                <input 
                  type="range" min="8" max="128" step="8" 
                  value={rayMarchSteps} 
                  onChange={(e) => setRayMarchSteps(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-800 w-full"></div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-green-500 mb-4">Aurora Borealis</h2>
            
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Aurora Effect Intensity</span>
                  <span className="font-mono text-green-400">{auroraEffectIntensity.toFixed(4)}</span>
                </label>
                <input 
                  type="range" min="0" max="0.05" step="0.001" 
                  value={auroraEffectIntensity} 
                  onChange={(e) => setAuroraEffectIntensity(parseFloat(e.target.value))}
                  className="w-full accent-green-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Sun Particle Intensity</span>
                  <span className="font-mono text-green-400">{sunParticleIntensity.toFixed(2)}</span>
                </label>
                <input 
                  type="range" min="0" max="5.0" step="0.1" 
                  value={sunParticleIntensity} 
                  onChange={(e) => setSunParticleIntensity(parseFloat(e.target.value))}
                  className="w-full accent-green-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Planet Magnetic Effect</span>
                  <span className="font-mono text-green-400">{planetMagneticEffect.toFixed(2)}</span>
                </label>
                <input 
                  type="range" min="0" max="5.0" step="0.1" 
                  value={planetMagneticEffect} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setPlanetMagneticEffect(val);
                    setAuroraHeightScale(val);
                    setAuroraVariance(val);
                  }}
                  className="w-full accent-green-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Aurora Height Scale</span>
                  <span className="font-mono text-green-400">{auroraHeightScale.toFixed(2)}</span>
                </label>
                <input 
                  type="range" min="0.1" max="2.0" step="0.05" 
                  value={auroraHeightScale} 
                  onChange={(e) => setAuroraHeightScale(parseFloat(e.target.value))}
                  className="w-full accent-green-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs mb-1">
                  <span>Aurora Variance</span>
                  <span className="font-mono text-green-400">{auroraVariance.toFixed(2)}</span>
                </label>
                <input 
                  type="range" min="0.1" max="5.0" step="0.1" 
                  value={auroraVariance} 
                  onChange={(e) => setAuroraVariance(parseFloat(e.target.value))}
                  className="w-full accent-green-500"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-800 w-full"></div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Controls</h2>
            <p className="text-xs text-gray-400 mb-4">
              Left Click + Drag to rotate camera.<br/>
              Scroll to zoom.
            </p>
            <button 
              className="w-full py-2 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              onClick={() => {
                setIsZoomedOut(!isZoomedOut);
                if (cameraRef.current) {
                  cameraRef.current.radius = !isZoomedOut ? 150 : 15;
                }
              }}
            >
              {isZoomedOut ? "Zoom In (Planet View)" : "Zoom Out 10x (System View)"}
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          {errorMsg && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 text-red-200 p-4 z-10">
              <div className="text-center">
                <h3 className="text-lg font-bold mb-2">Render Engine Error</h3>
                <p className="font-mono text-sm">{errorMsg}</p>
              </div>
            </div>
          )}
          <canvas 
            key={backendType}
            ref={canvasRef} 
            className="w-full h-full outline-none touch-none"
          />
        </div>
      </div>
    </div>
  );
}

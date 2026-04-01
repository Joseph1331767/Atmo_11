export const shellVertexWGSL = `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>

attribute position : vec3<f32>;
attribute normal : vec3<f32>;
attribute uv : vec2<f32>;

varying vPositionW : vec3<f32>;
varying vNormalW : vec3<f32>;
varying vUV : vec2<f32>;

uniform planetRadius: f32;
uniform atmosphereRadius: f32;
uniform atmosphereHeight: f32;
uniform cameraPosition: vec3<f32>;
uniform sunCount: i32;
uniform sunDirections: array<vec4<f32>, 4>;
uniform sunIntensities: vec4<f32>;
uniform sunColors: array<vec4<f32>, 4>;

uniform rayleighScattering: vec3<f32>;
uniform mieScattering: f32;
uniform rayleighScaleHeight: f32;
uniform mieScaleHeight: f32;
uniform mieG: f32;
uniform rayMarchSteps: i32;
uniform lightSteps: i32;

uniform highAngleColor: vec3<f32>;
uniform lowAngleColor: vec3<f32>;
uniform sunParticleIntensity: f32;
uniform planetMagneticEffect: f32;
uniform auroraEffectIntensity: f32;
uniform auroraHeightScale: f32;
uniform auroraVariance: f32;
uniform glowEffectScale: f32;
uniform shellOpacity: f32;
uniform time: f32;
uniform deltaTime: f32;
uniform screenRatio: f32;
uniform densityLayerCount: i32;
uniform totalOpticalDepth: f32;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
    var output : FragmentInputs;
    
    let positionW = mesh.world * vec4<f32>(input.position, 1.0);
    output.vPositionW = positionW.xyz;
    output.vNormalW = normalize((mesh.world * vec4<f32>(input.normal, 0.0)).xyz);
    output.vUV = input.uv;
    
    output.position = scene.viewProjection * positionW;
    
    return output;
}
`;

export const shellFragmentWGSL = `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>

varying vPositionW : vec3<f32>;
varying vNormalW : vec3<f32>;
varying vUV : vec2<f32>;

uniform planetRadius: f32;
uniform atmosphereRadius: f32;
uniform atmosphereHeight: f32;
uniform cameraPosition: vec3<f32>;
uniform sunCount: i32;
uniform sunDirections: array<vec4<f32>, 4>;
uniform sunIntensities: vec4<f32>;
uniform sunColors: array<vec4<f32>, 4>;

uniform rayleighScattering: vec3<f32>;
uniform mieScattering: f32;
uniform rayleighScaleHeight: f32;
uniform mieScaleHeight: f32;
uniform mieG: f32;
uniform rayMarchSteps: i32;
uniform lightSteps: i32;

uniform highAngleColor: vec3<f32>;
uniform lowAngleColor: vec3<f32>;
uniform sunParticleIntensity: f32;
uniform planetMagneticEffect: f32;
uniform auroraEffectIntensity: f32;
uniform auroraHeightScale: f32;
uniform auroraVariance: f32;
uniform glowEffectScale: f32;
uniform shellOpacity: f32;
uniform time: f32;
uniform deltaTime: f32;
uniform screenRatio: f32;
uniform densityLayerCount: i32;
uniform totalOpticalDepth: f32;

const PI: f32 = 3.14159265359;

fn raySphereIntersect(r0: vec3<f32>, rd: vec3<f32>, s0: vec3<f32>, sr: f32) -> vec2<f32> {
    let s0_r0 = r0 - s0;
    let b = dot(rd, s0_r0);
    let c = dot(s0_r0, s0_r0) - (sr * sr);
    var h = b * b - c;
    if (h < 0.0) {
        return vec2<f32>(-1.0, -1.0);
    }
    h = sqrt(h);
    return vec2<f32>(-b - h, -b + h);
}

fn rayleighPhase(cosTheta: f32) -> f32 {
    return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

fn miePhase(cosTheta: f32, g: f32) -> f32 {
    let g2 = g * g;
    let num = 3.0 * (1.0 - g2) * (1.0 + cosTheta * cosTheta);
    let den = 8.0 * PI * (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
    return num / den;
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn getAurora(p: vec3<f32>, n: vec3<f32>, h: f32, rayDir: vec3<f32>, time: f32, sunDir: vec3<f32>, planetRadius: f32, atmoHeight: f32, magnetic: f32, sunParticle: f32, intensity: f32, heightScale: f32, variance: f32) -> vec3<f32> {
    let lat = abs(n.y);
    
    let combinedForce = sunParticle * (1.0 + magnetic * 0.5);
    let spread = clamp(combinedForce * 0.1, 0.0, 0.7);
    
    let nightShift = smoothstep(0.5, -1.0, dot(n, sunDir)) * 0.15;
    
    let ringCenter = 0.85 - spread * 0.5 - nightShift;
    let ringWidth = 0.05 + spread * 0.3;
    let ring = smoothstep(ringCenter - ringWidth, ringCenter, lat) * smoothstep(ringCenter + ringWidth, ringCenter, lat);
    
    if (ring < 0.001) { return vec3<f32>(0.0); }
    
    let auroraBottom = atmoHeight * 0.8;
    let auroraTop = atmoHeight * max(1.0, 4.0 * heightScale);
    
    let hNorm = (h - auroraBottom) / (auroraTop - auroraBottom);
    let hProfile = smoothstep(0.0, 0.1, hNorm) * smoothstep(1.0, 0.3, hNorm);
    
    let viewDependence = pow(1.0 - abs(dot(rayDir, n)), 3.0) * 2.0 + 0.5;
    
    let t = time * 0.5;
    var uv = vec2<f32>(atan2(n.z, n.x), lat);
    
    let warp = sin(uv.x * (10.0 + magnetic * 5.0) + t) * 0.1 * magnetic * variance;
    uv.x += warp;
    
    let n1 = sin(uv.x * 30.0 * variance - t * 1.2);
    let n2 = sin(uv.x * 70.0 * variance + t * 0.8 + uv.y * 20.0);
    let n3 = sin(uv.x * 150.0 * variance - t * 2.0);
    
    var curtain = smoothstep(0.1, 0.9, (n1 + n2 * 0.5 + n3 * 0.25) * 0.5 + 0.5);
    
    let streaks = sin(hNorm * 15.0 + uv.x * 200.0) * 0.5 + 0.5;
    curtain *= mix(0.7, 1.0, streaks);
    
    let baseColor = vec3<f32>(0.1, 1.0, 0.5);
    let topColor = vec3<f32>(0.8, 0.2, 1.0);
    let intenseColor = vec3<f32>(1.0, 0.2, 0.2);
    
    var color = mix(baseColor, topColor, hNorm);
    color = mix(color, intenseColor, smoothstep(0.02, 0.05, intensity) * (1.0 - hNorm) * 0.5);
    
    let secondaryGlow = ring * hProfile * 0.2;
    let secondaryColor = mix(vec3<f32>(0.0, 0.5, 0.2), vec3<f32>(0.5, 0.0, 0.5), hNorm);
    
    let sunBias = mix(1.0, 0.2, smoothstep(-0.5, 0.5, dot(n, sunDir)));
    
    return (color * curtain * viewDependence * 2.0 + secondaryColor * secondaryGlow) * ring * hProfile * sunBias * intensity;
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
    var output : FragmentOutputs;
    
    let planetCenter = vec3<f32>(mesh.world[3].xyz);
    let rayOrigin = uniforms.cameraPosition;
    let rayDir = normalize(input.vPositionW - uniforms.cameraPosition);

    // Intersect with atmosphere (use larger radius to accommodate aurora)
    let maxRadius = uniforms.planetRadius + uniforms.atmosphereHeight * max(1.0, 8.0 * uniforms.auroraHeightScale);
    let atmoIntersection = raySphereIntersect(rayOrigin, rayDir, planetCenter, maxRadius);
    if (atmoIntersection.y < 0.0) {
        discard;
    }

    // Intersect with planet
    let planetIntersection = raySphereIntersect(rayOrigin, rayDir, planetCenter, uniforms.planetRadius);

    var tMin = max(0.0, atmoIntersection.x);
    var tMax = atmoIntersection.y;
    if (planetIntersection.x > 0.0) {
        tMax = min(tMax, planetIntersection.x);
    }

    if (tMin >= tMax) {
        discard;
    }

    // Scale scattering coefficients to account for the small planet radius (5.0 vs 6371000.0)
    let rScattering = uniforms.rayleighScattering * 1000.0;
    let mScattering = uniforms.mieScattering * 1000.0;

    var totalRayleigh = vec3<f32>(0.0);
    var totalMie = vec3<f32>(0.0);
    var totalAurora = vec3<f32>(0.0);
    var opticalDepthRayleigh = 0.0;
    var opticalDepthMie = 0.0;

    let sunDir = normalize(-uniforms.sunDirections[0].xyz);
    let sunIntensity = uniforms.sunIntensities.x;
    let sunColor = uniforms.sunColors[0].xyz;

    let cosTheta = dot(rayDir, sunDir);
    let phaseR = rayleighPhase(cosTheta);
    let phaseM = miePhase(cosTheta, uniforms.mieG);

    // Precompute some aurora values
    let auroraBottom = uniforms.atmosphereHeight * 0.8;
    let auroraTop = uniforms.atmosphereHeight * max(1.0, 4.0 * uniforms.auroraHeightScale);
    let totalDist = tMax - tMin;

    for (var i = 0; i < 128; i++) {
        if (i >= uniforms.rayMarchSteps) { break; }

        // Non-linear step distribution: more samples near the planet
        let normalizedT = f32(i) / f32(uniforms.rayMarchSteps);
        let nextNormalizedT = f32(i + 1) / f32(uniforms.rayMarchSteps);
        
        // Bias towards the planet (tMax)
        let bias = 1.5;
        let t0 = tMin + totalDist * (1.0 - pow(1.0 - normalizedT, bias));
        let t1 = tMin + totalDist * (1.0 - pow(1.0 - nextNormalizedT, bias));
        let stepSize = t1 - t0;
        let tMid = t0 + stepSize * 0.5;

        let samplePos = rayOrigin + rayDir * tMid;
        let p = samplePos - planetCenter;
        let h = length(p);
        let height = h - uniforms.planetRadius;

        let hr = exp(-height / uniforms.rayleighScaleHeight) * stepSize;
        let hm = exp(-height / uniforms.mieScaleHeight) * stepSize;

        opticalDepthRayleigh += hr;
        opticalDepthMie += hm;

        // Light raymarching (only for Rayleigh/Mie)
        var opticalDepthLightRayleigh = 0.0;
        var opticalDepthLightMie = 0.0;
        var shadow = 1.0;
        
        let lightPlanetIntersection = raySphereIntersect(samplePos, sunDir, planetCenter, uniforms.planetRadius);
        if (lightPlanetIntersection.x > 0.0) {
            shadow = 0.0;
        } else {
            let lightAtmoIntersection = raySphereIntersect(samplePos, sunDir, planetCenter, uniforms.atmosphereRadius);
            let tLightMax = lightAtmoIntersection.y;
            let lightSegmentLength = tLightMax / f32(uniforms.lightSteps);
            var tLightCurrent = lightSegmentLength * 0.5;

            for (var j = 0; j < 32; j++) {
                if (j >= uniforms.lightSteps) { break; }
                let lightSamplePos = samplePos + sunDir * tLightCurrent;
                let lightHeight = length(lightSamplePos - planetCenter) - uniforms.planetRadius;
                
                opticalDepthLightRayleigh += exp(-lightHeight / uniforms.rayleighScaleHeight) * lightSegmentLength;
                opticalDepthLightMie += exp(-lightHeight / uniforms.mieScaleHeight) * lightSegmentLength;
                
                tLightCurrent += lightSegmentLength;
            }
        }

        // Extinction from sample to camera
        let tauCamera = rScattering * opticalDepthRayleigh + vec3<f32>(mScattering) * 1.1 * opticalDepthMie;
        // Extinction from sample to sun
        let tauSun = rScattering * opticalDepthLightRayleigh + vec3<f32>(mScattering) * 1.1 * opticalDepthLightMie;
        
        // Rayleigh/Mie use both extinctions and shadow
        let attenuationRayleigh = exp(-(tauCamera + tauSun)) * shadow;
        totalRayleigh += hr * attenuationRayleigh;
        totalMie += hm * attenuationRayleigh;

        // Aurora only uses camera extinction (it's an emission)
        if (uniforms.auroraEffectIntensity > 0.0 && height >= auroraBottom && height <= auroraTop) {
            let auroraEmission = getAurora(p, p / h, height, rayDir, uniforms.time, sunDir, uniforms.planetRadius, uniforms.atmosphereHeight, uniforms.planetMagneticEffect, uniforms.sunParticleIntensity, uniforms.auroraEffectIntensity, uniforms.auroraHeightScale, uniforms.auroraVariance);
            totalAurora += auroraEmission * exp(-tauCamera) * stepSize * 10.0;
        }
    }

    var color = (totalRayleigh * rScattering * phaseR + totalMie * mScattering * phaseM) * sunIntensity * sunColor;
    color += totalAurora;
    
    // Tone mapping (Exposure)
    color = vec3<f32>(1.0) - exp(-color * uniforms.glowEffectScale);

    // Calculate alpha based on optical depth to blend with background
    var alpha = 1.0 - exp(-(opticalDepthRayleigh * rScattering.b + opticalDepthMie * mScattering));
    
    // Apply a view-dependent fade to make the center more transparent, enhancing the tangent glow
    let impactParameter = length(cross(rayOrigin - planetCenter, rayDir));
    let normalizedDist = clamp(impactParameter / uniforms.planetRadius, 0.0, 1.0);
    let edgeGlow = pow(normalizedDist, 3.0); // 0 at center, 1 at edge
    alpha *= mix(0.15, 1.0, edgeGlow); // Keep 15% opacity in the center, 100% at the edges

    if (uniforms.auroraEffectIntensity > 0.0) {
        alpha = max(alpha, length(totalAurora));
    }
    alpha *= uniforms.shellOpacity;

    output.color = vec4<f32>(color, alpha);
    
    return output;
}
`;

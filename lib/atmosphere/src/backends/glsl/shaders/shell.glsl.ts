export const shellVertexGLSL = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 viewProjection;

varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;

void main() {
    vec4 p = vec4(position, 1.0);
    vPositionW = vec3(world * p);
    vNormalW = normalize(vec3(world * vec4(normal, 0.0)));
    vUV = uv;
    gl_Position = viewProjection * world * p;
}
`;

export const shellFragmentGLSL = `
precision highp float;

varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;

uniform mat4 world;
uniform float planetRadius;
uniform float atmosphereRadius;
uniform float atmosphereHeight;
uniform vec3 cameraPosition;
uniform int sunCount;
uniform vec4 sunDirections[4];
uniform float sunIntensities[4];
uniform vec4 sunColors[4];

uniform vec3 rayleighScattering;
uniform float mieScattering;
uniform float rayleighScaleHeight;
uniform float mieScaleHeight;
uniform float mieG;
uniform int rayMarchSteps;
uniform int lightSteps;

uniform vec3 highAngleColor;
uniform vec3 lowAngleColor;
uniform float sunParticleIntensity;
uniform float planetMagneticEffect;
uniform float auroraEffectIntensity;
uniform float auroraHeightScale;
uniform float auroraVariance;
uniform float glowEffectScale;
uniform float shellOpacity;
uniform float time;
uniform float deltaTime;
uniform float screenRatio;
uniform int densityLayerCount;
uniform float totalOpticalDepth;

#define PI 3.14159265359

vec2 raySphereIntersect(vec3 r0, vec3 rd, vec3 s0, float sr) {
    vec3 s0_r0 = r0 - s0;
    float b = dot(rd, s0_r0);
    float c = dot(s0_r0, s0_r0) - (sr * sr);
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

float rayleighPhase(float cosTheta) {
    return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

float miePhase(float cosTheta, float g) {
    float g2 = g * g;
    float num = 3.0 * (1.0 - g2) * (1.0 + cosTheta * cosTheta);
    float den = 8.0 * PI * (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
    return num / den;
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 getAurora(vec3 p, vec3 n, float h, vec3 rayDir, float time, vec3 sunDir, float planetRadius, float atmoHeight, float magnetic, float sunParticle, float intensity, float heightScale, float variance) {
    float lat = abs(n.y);
    
    // Spread based on sunParticle AND magnetic effect
    float combinedForce = sunParticle * (1.0 + magnetic * 0.5);
    float spread = clamp(combinedForce * 0.1, 0.0, 0.7);
    
    // Vector bias away from the sun (night side gets pushed further towards equator)
    float nightShift = smoothstep(0.5, -1.0, dot(n, sunDir)) * 0.15;
    
    float ringCenter = 0.85 - spread * 0.5 - nightShift;
    float ringWidth = 0.05 + spread * 0.3;
    float ring = smoothstep(ringCenter - ringWidth, ringCenter, lat) * smoothstep(ringCenter + ringWidth, ringCenter, lat);
    
    if (ring < 0.001) return vec3(0.0);
    
    float auroraBottom = atmoHeight * 0.8;
    float auroraTop = atmoHeight * max(1.0, 4.0 * heightScale);
    
    float hNorm = (h - auroraBottom) / (auroraTop - auroraBottom);
    float hProfile = smoothstep(0.0, 0.1, hNorm) * smoothstep(1.0, 0.3, hNorm);
    
    // View dependence (curtain effect - brighter when looking through the edge)
    float viewDependence = pow(1.0 - abs(dot(rayDir, n)), 3.0) * 2.0 + 0.5;
    
    // Magnetic state change (turbulence and folding)
    float t = time * 0.5;
    vec2 uv = vec2(atan(n.z, n.x), lat);
    
    float warp = sin(uv.x * (10.0 + magnetic * 5.0) + t) * 0.1 * magnetic * variance;
    uv.x += warp;
    
    float n1 = sin(uv.x * 30.0 * variance - t * 1.2);
    float n2 = sin(uv.x * 70.0 * variance + t * 0.8 + uv.y * 20.0);
    float n3 = sin(uv.x * 150.0 * variance - t * 2.0);
    
    float curtain = smoothstep(0.1, 0.9, (n1 + n2 * 0.5 + n3 * 0.25) * 0.5 + 0.5);
    
    float streaks = sin(hNorm * 15.0 + uv.x * 200.0) * 0.5 + 0.5;
    curtain *= mix(0.7, 1.0, streaks);
    
    // Color play based on intensity
    vec3 baseColor = vec3(0.1, 1.0, 0.5);
    vec3 topColor = vec3(0.8, 0.2, 1.0);
    vec3 intenseColor = vec3(1.0, 0.2, 0.2);
    
    vec3 color = mix(baseColor, topColor, hNorm);
    // Scale intensity for color mixing so it still reaches intense colors even at 0.05 max
    color = mix(color, intenseColor, smoothstep(0.02, 0.05, intensity) * (1.0 - hNorm) * 0.5);
    
    // Secondary scattering fake (ambient glow around curtains)
    float secondaryGlow = ring * hProfile * 0.2;
    vec3 secondaryColor = mix(vec3(0.0, 0.5, 0.2), vec3(0.5, 0.0, 0.5), hNorm);
    
    // Brighter on the night side
    float sunBias = mix(1.0, 0.2, smoothstep(-0.5, 0.5, dot(n, sunDir)));
    
    return (color * curtain * viewDependence * 2.0 + secondaryColor * secondaryGlow) * ring * hProfile * sunBias * intensity;
}

void main() {
    vec3 planetCenter = vec3(world[3].xyz);
    vec3 rayOrigin = cameraPosition;
    vec3 rayDir = normalize(vPositionW - cameraPosition);

    // Intersect with atmosphere (use larger radius to accommodate aurora)
    float maxRadius = planetRadius + atmosphereHeight * max(1.0, 8.0 * auroraHeightScale);
    vec2 atmoIntersection = raySphereIntersect(rayOrigin, rayDir, planetCenter, maxRadius);
    if (atmoIntersection.y < 0.0) {
        discard; // Ray missed atmosphere entirely
    }

    // Intersect with planet
    vec2 planetIntersection = raySphereIntersect(rayOrigin, rayDir, planetCenter, planetRadius);

    // Calculate ray start and end points
    float tMin = max(0.0, atmoIntersection.x);
    float tMax = atmoIntersection.y;
    if (planetIntersection.x > 0.0) {
        tMax = min(tMax, planetIntersection.x);
    }

    if (tMin >= tMax) {
        discard; // Ray is blocked or invalid
    }

    // Scale scattering coefficients to account for the small planet radius (5.0 vs 6371000.0)
    vec3 rScattering = rayleighScattering * 1000.0;
    float mScattering = mieScattering * 1000.0;

    float dither = hash(gl_FragCoord.xy);
    float segmentLength = (tMax - tMin) / float(rayMarchSteps);
    float tCurrent = tMin + segmentLength * dither;

    vec3 totalRayleigh = vec3(0.0);
    vec3 totalMie = vec3(0.0);
    vec3 totalAurora = vec3(0.0);
    float opticalDepthRayleigh = 0.0;
    float opticalDepthMie = 0.0;

    // Use only the first sun for scattering to keep performance reasonable
    vec3 sunDir = normalize(-sunDirections[0].xyz);
    float sunIntensity = sunIntensities[0];
    vec3 sunColor = sunColors[0].xyz;

    float cosTheta = dot(rayDir, sunDir);
    float phaseR = rayleighPhase(cosTheta);
    float phaseM = miePhase(cosTheta, mieG);

    // Precompute some aurora values
    float auroraBottom = atmosphereHeight * 0.8;
    float auroraTop = atmosphereHeight * max(1.0, 4.0 * auroraHeightScale);
    float totalDist = tMax - tMin;

    for (int i = 0; i < 128; i++) {
        if (i >= rayMarchSteps) break;

        // Non-linear step distribution: more samples near the planet
        float normalizedT = float(i) / float(rayMarchSteps);
        float nextNormalizedT = float(i + 1) / float(rayMarchSteps);
        
        // Bias towards the planet (tMax)
        float bias = 1.5;
        float t0 = tMin + totalDist * (1.0 - pow(1.0 - normalizedT, bias));
        float t1 = tMin + totalDist * (1.0 - pow(1.0 - nextNormalizedT, bias));
        float stepSize = t1 - t0;
        float tMid = t0 + stepSize * 0.5;

        vec3 samplePos = rayOrigin + rayDir * tMid;
        vec3 p = samplePos - planetCenter;
        float h = length(p);
        float height = h - planetRadius;

        // Calculate density at current height
        float hr = exp(-height / rayleighScaleHeight) * stepSize;
        float hm = exp(-height / mieScaleHeight) * stepSize;

        opticalDepthRayleigh += hr;
        opticalDepthMie += hm;

        // Light raymarching (only for Rayleigh/Mie)
        float opticalDepthLightRayleigh = 0.0;
        float opticalDepthLightMie = 0.0;
        float shadow = 1.0;
        
        vec2 lightPlanetIntersection = raySphereIntersect(samplePos, sunDir, planetCenter, planetRadius);
        if (lightPlanetIntersection.x > 0.0) {
            shadow = 0.0;
        } else {
            vec2 lightAtmoIntersection = raySphereIntersect(samplePos, sunDir, planetCenter, atmosphereRadius);
            float tLightMax = lightAtmoIntersection.y;
            float lightSegmentLength = tLightMax / float(lightSteps);
            float tLightCurrent = lightSegmentLength * 0.5;

            for (int j = 0; j < 32; j++) {
                if (j >= lightSteps) break;
                vec3 lightSamplePos = samplePos + sunDir * tLightCurrent;
                float lightHeight = length(lightSamplePos - planetCenter) - planetRadius;
                
                opticalDepthLightRayleigh += exp(-lightHeight / rayleighScaleHeight) * lightSegmentLength;
                opticalDepthLightMie += exp(-lightHeight / mieScaleHeight) * lightSegmentLength;
                
                tLightCurrent += lightSegmentLength;
            }
        }

        // Extinction from sample to camera
        vec3 tauCamera = rScattering * opticalDepthRayleigh + vec3(mScattering) * 1.1 * opticalDepthMie;
        // Extinction from sample to sun
        vec3 tauSun = rScattering * opticalDepthLightRayleigh + vec3(mScattering) * 1.1 * opticalDepthLightMie;
        
        // Rayleigh/Mie use both extinctions and shadow
        vec3 attenuationRayleigh = exp(-(tauCamera + tauSun)) * shadow;
        totalRayleigh += hr * attenuationRayleigh;
        totalMie += hm * attenuationRayleigh;

        // Aurora only uses camera extinction (it's an emission)
        if (auroraEffectIntensity > 0.0 && height >= auroraBottom && height <= auroraTop) {
            vec3 auroraEmission = getAurora(p, p / h, height, rayDir, time, sunDir, planetRadius, atmosphereHeight, planetMagneticEffect, sunParticleIntensity, auroraEffectIntensity, auroraHeightScale, auroraVariance);
            totalAurora += auroraEmission * exp(-tauCamera) * stepSize * 10.0;
        }
    }

    vec3 color = (totalRayleigh * rScattering * phaseR + totalMie * mScattering * phaseM) * sunIntensity * sunColor;
    color += totalAurora;
    
    // Tone mapping (Exposure)
    color = 1.0 - exp(-color * glowEffectScale);

    // Calculate alpha based on optical depth to blend with background
    float alpha = 1.0 - exp(-(opticalDepthRayleigh * rScattering.b + opticalDepthMie * mScattering));
    
    // Apply a view-dependent fade to make the center more transparent, enhancing the tangent glow
    float impactParameter = length(cross(rayOrigin - planetCenter, rayDir));
    float normalizedDist = clamp(impactParameter / planetRadius, 0.0, 1.0);
    float edgeGlow = pow(normalizedDist, 3.0); // 0 at center, 1 at edge
    alpha *= mix(0.15, 1.0, edgeGlow); // Keep 15% opacity in the center, 100% at the edges

    if (auroraEffectIntensity > 0.0) {
        alpha = max(alpha, length(totalAurora));
    }
    alpha *= shellOpacity;

    gl_FragColor = vec4(color, alpha);
}
`;

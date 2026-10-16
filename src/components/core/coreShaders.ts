/**
 * GLSL for the Living Core. Lighting is computed analytically in view space,
 * matching the reference: a lavender hot spot near the centre, saturated violet
 * body and a deep indigo limb.
 */

export const orbVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vObj;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const orbFragment = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uCool;
  uniform float uDim;
  varying vec3 vNormal;
  varying vec3 vObj;

  // Cheap smooth value noise for a slow "energy" drift inside the core.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 L = normalize(vec3(-0.12, 0.08, 1.0));
    float d = max(dot(n, L), 0.0);
    float facing = max(n.z, 0.0);

    vec3 limbViolet = vec3(0.105, 0.086, 0.33);
    vec3 bodyViolet = vec3(0.47, 0.37, 0.91);
    vec3 hotViolet  = vec3(0.92, 0.89, 1.0);
    vec3 limbBlue = vec3(0.07, 0.10, 0.34);
    vec3 bodyBlue = vec3(0.36, 0.45, 0.95);
    vec3 hotBlue  = vec3(0.86, 0.92, 1.0);

    vec3 limb = mix(limbViolet, limbBlue, uCool);
    vec3 body = mix(bodyViolet, bodyBlue, uCool);
    vec3 hot  = mix(hotViolet, hotBlue, uCool);

    float swirl = noise(vObj * 2.2 + vec3(0.0, uTime * 0.12, uTime * 0.05)) - 0.5;
    float lit = clamp(d + swirl * 0.08, 0.0, 1.0);

    vec3 col = mix(limb, body, smoothstep(0.12, 0.9, lit));
    col = mix(col, hot, pow(lit, 9.0) * (0.8 + uGlow * 0.3));
    // Faint violet rim so the silhouette reads against the night.
    float rim = pow(1.0 - facing, 3.0);
    col += vec3(0.25, 0.2, 0.55) * rim * 0.22;
    // Cool bounce light from the lower right gives the sphere volume.
    float bounce = pow(max(dot(n, normalize(vec3(0.65, -0.55, 0.35))), 0.0), 2.0);
    col += mix(vec3(0.16, 0.18, 0.55), vec3(0.12, 0.24, 0.6), uCool) * bounce * 0.32;
    // A soft specular glint near the hot spot.
    vec3 R = reflect(-L, n);
    float spec = pow(max(R.z, 0.0), 48.0);
    col += vec3(0.95, 0.93, 1.0) * spec * 0.18;
    col *= 1.0 + uGlow * 0.35 - uDim;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const haloVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFragment = /* glsl */ `
  uniform float uStrength;
  uniform float uCool;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float fall = 1.0 - smoothstep(0.0, 1.0, r);
    float a = fall * fall * uStrength * 0.85;
    vec3 c = mix(vec3(0.46, 0.37, 0.98), vec3(0.34, 0.45, 1.0), uCool);
    gl_FragColor = vec4(c * a, a);
  }
`;

/** Thin outer shell rendered from the inside: a fresnel glow hugging the silhouette. */
export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform float uStrength;
  uniform float uCool;
  varying vec3 vNormal;
  void main() {
    // Back faces of a 1.16-radius shell: -n.z is ~0.5 where it meets the orb's
    // silhouette and 0 at the shell's edge, so the glow fades smoothly outward.
    float rim = pow(clamp(-vNormal.z * 2.0, 0.0, 1.0), 2.2);
    vec3 c = mix(vec3(0.55, 0.45, 1.0), vec3(0.45, 0.58, 1.0), uCool);
    float a = rim * uStrength;
    gl_FragColor = vec4(c * a, a);
  }
`;

/**
 * Orbit rings fade with depth: the arcs in front of the orb are bright, the arcs
 * behind it recede, which reads as real 3D without extra geometry.
 */
export const ringVertex = /* glsl */ `
  varying float vDepth;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 centre = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float scale = length(modelMatrix[0].xyz);
    vDepth = (world.z - centre.z) / (scale * 1.8);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vDepth;
  void main() {
    float front = smoothstep(-1.0, 1.0, vDepth);
    float a = uOpacity * mix(0.38, 1.0, front);
    vec3 c = uColor * mix(0.8, 1.05, front);
    gl_FragColor = vec4(c, a);
  }
`;

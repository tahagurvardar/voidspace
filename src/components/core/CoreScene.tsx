'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { coreStore } from '@/store/coreStore';
import type { GraphicsQuality } from '@/types';
import { SIGNAL_DURATION_S, coreTargets, damp, signalEnvelope } from './coreDynamics';
import {
  atmosphereFragment,
  atmosphereVertex,
  haloFragment,
  haloVertex,
  orbFragment,
  orbVertex,
  ringFragment,
  ringVertex,
} from './coreShaders';

/**
 * The Living Core. Mounted ONCE for the whole app; mode changes, signals and the
 * anchor position are read from `coreStore` inside the frame loop, so React never
 * re-renders per frame and the scene is never remounted on navigation.
 *
 * Units: an orthographic camera maps one world unit to one CSS pixel. The core is
 * built in a unit space (orb radius 1, rings ≈ 1.75) and scaled to its DOM anchor.
 */

const RING_RADIUS = 1.75;
/** Unit-space half extent of the whole system (rings + moons). */
const SYSTEM_EXTENT = 1.85;

interface QualityProfile {
  dpr: [number, number];
  dust: number;
  segments: number;
}

function qualityProfile(q: GraphicsQuality): QualityProfile {
  const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  switch (q) {
    case 'high':
      return { dpr: [1, Math.min(deviceDpr, 2)], dust: 28, segments: 96 };
    case 'low':
      return { dpr: [1, 1], dust: 10, segments: 48 };
    default:
      return { dpr: [1, Math.min(deviceDpr, 1.75)], dust: 20, segments: 72 };
  }
}

function makeDust(count: number): Float32Array {
  const arr = new Float32Array(count * 3);
  // Deterministic layout: same sky on every load.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const r = 1.4 + rnd() * 1.1;
    const a = rnd() * Math.PI * 2;
    const z = (rnd() - 0.5) * 1.2;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = Math.sin(a) * r * 0.75;
    arr[i * 3 + 2] = z;
  }
  return arr;
}

function CoreSystem({ quality }: { quality: QualityProfile }) {
  const { size, invalidate } = useThree();
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const ringsSpin = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const moonA = useRef<THREE.Mesh>(null);
  const moonB = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const spark = useRef<THREE.Mesh>(null);
  const dust = useRef<THREE.Points>(null);
  const orbMat = useRef<THREE.ShaderMaterial>(null);
  const haloMat = useRef<THREE.ShaderMaterial>(null);
  const atmoMat = useRef<THREE.ShaderMaterial>(null);

  const orbUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGlow: { value: 0 },
      uCool: { value: 0 },
      uDim: { value: 0 },
    }),
    [],
  );
  const atmoUniforms = useMemo(() => ({ uStrength: { value: 0.55 }, uCool: { value: 0 } }), []);
  const ringAUniforms = useMemo(() => ({ uColor: { value: new THREE.Color('#9d96df') }, uOpacity: { value: 0.8 } }), []);
  const ringBUniforms = useMemo(() => ({ uColor: { value: new THREE.Color('#b0a9ec') }, uOpacity: { value: 0.8 } }), []);
  const haloUniforms = useMemo(() => ({ uStrength: { value: 0.55 }, uCool: { value: 0 } }), []);
  const dustPositions = useMemo(() => makeDust(quality.dust), [quality.dust]);

  // Smoothed live values (mutable, never React state).
  const live = useRef({
    x: 0,
    y: 0,
    scale: 0,
    spin: 0,
    breath: 0.02,
    period: 7,
    cool: 0,
    rings: 0.8,
    tiltX: 0,
    tiltY: 0,
    phase: 0,
    initialised: false,
    sparkDir: new THREE.Vector2(1, 0.4).normalize(),
    lastSignalSeq: -1,
  });

  useEffect(() => {
    // Signals arrive outside of React; make sure a frame is scheduled.
    return coreStore.subscribe(() => invalidate());
  }, [invalidate]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = coreStore.getState();
    const L = live.current;
    const g = root.current;
    if (!g) return;

    // ── Anchor → position & scale (read the rect each frame; robust to layout animation).
    const el = s.anchorEl;
    if (!el || !el.isConnected) {
      g.visible = false;
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const targetX = rect.left + rect.width / 2 - size.width / 2;
    const targetY = size.height / 2 - (rect.top + rect.height / 2);
    const targetScale = Math.min(rect.width, rect.height) / 2 / SYSTEM_EXTENT;
    if (!L.initialised) {
      L.x = targetX;
      L.y = targetY;
      L.scale = targetScale;
      L.initialised = true;
    }
    L.x = damp(L.x, targetX, 9, dt);
    L.y = damp(L.y, targetY, 9, dt);
    L.scale = damp(L.scale, targetScale, 9, dt);

    // ── Mode targets.
    const t = coreTargets(s.mode, s.focusRunning);
    L.spin = damp(L.spin, t.spin, 2, dt);
    L.breath = damp(L.breath, t.breath, 2, dt);
    L.period = damp(L.period, t.breathPeriod, 1, dt);
    L.cool = damp(L.cool, t.coolness, 1.5, dt);
    L.rings = damp(L.rings, t.rings, 2, dt);
    L.tiltX = damp(L.tiltX, -s.pointer.y * t.pointerTilt, 4, dt);
    L.tiltY = damp(L.tiltY, s.pointer.x * t.pointerTilt, 4, dt);
    L.phase += (dt / L.period) * Math.PI * 2;

    // ── Signals.
    const sig = s.signal;
    let save = 0;
    let release = 0;
    let complete = 0;
    let sigAge = 0;
    if (sig) {
      sigAge = (performance.now() - sig.at) / 1000;
      const env = signalEnvelope(sig.kind, sigAge);
      if (sig.kind === 'save') save = env;
      else if (sig.kind === 'release') release = env;
      else complete = env;
      if (sig.seq !== L.lastSignalSeq) {
        L.lastSignalSeq = sig.seq;
        const a = (sig.seq * 2.399) % (Math.PI * 2); // golden-angle spread
        L.sparkDir.set(Math.cos(a), Math.sin(a) * 0.7 + 0.35).normalize();
      }
    }

    const breathe = 1 + Math.sin(L.phase) * L.breath;
    g.position.set(L.x, L.y, 0);
    g.scale.setScalar(L.scale * breathe * (1 - release * 0.04 + complete * 0.03));

    if (tilt.current) {
      tilt.current.rotation.x = L.tiltX;
      tilt.current.rotation.y = L.tiltY;
    }
    if (ringsSpin.current) ringsSpin.current.rotation.z += L.spin * dt * 0.35;
    if (ringA.current) ringA.current.rotation.z += L.spin * dt;
    if (ringB.current) ringB.current.rotation.z -= L.spin * dt * 0.7;

    for (const ring of [ringA.current, ringB.current]) {
      const u = (ring?.material as THREE.ShaderMaterial | undefined)?.uniforms;
      if (u) u.uOpacity!.value = L.rings * (1 - release * 0.5);
    }

    const time = state.clock.elapsedTime;
    const moonAngle = time * (0.12 + L.spin);
    moonA.current?.position.set(Math.cos(moonAngle) * RING_RADIUS, Math.sin(moonAngle) * RING_RADIUS, 0);
    moonB.current?.position.set(
      Math.cos(-moonAngle * 0.8 + 2.4) * RING_RADIUS,
      Math.sin(-moonAngle * 0.8 + 2.4) * RING_RADIUS,
      0,
    );

    const ou = orbMat.current?.uniforms;
    if (ou) {
      ou.uTime!.value = time;
      ou.uGlow!.value = save * 0.55 + complete * 0.7;
      ou.uCool!.value = L.cool;
      ou.uDim!.value = release * 0.35;
    }
    const au = atmoMat.current?.uniforms;
    if (au) {
      au.uStrength!.value = 0.55 + save * 0.4 + complete * 0.6 - release * 0.3;
      au.uCool!.value = L.cool;
    }
    const hu = haloMat.current?.uniforms;
    if (hu) {
      hu.uStrength!.value = 0.55 + save * 0.35 + complete * 0.6 - release * 0.25;
      hu.uCool!.value = L.cool;
    }

    // Completion: an expanding ring wave.
    if (pulse.current) {
      const active = sig?.kind === 'complete' && sigAge < SIGNAL_DURATION_S.complete;
      pulse.current.visible = active;
      if (active) {
        const p = sigAge / SIGNAL_DURATION_S.complete;
        pulse.current.scale.setScalar(1 + p * 2.2);
        (pulse.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.6;
      }
    }

    // Save: a spark leaves the core and settles into orbit distance.
    if (spark.current) {
      const active = sig?.kind === 'save' && sigAge < SIGNAL_DURATION_S.save;
      spark.current.visible = active;
      if (active) {
        const p = sigAge / SIGNAL_DURATION_S.save;
        const ease = 1 - Math.pow(1 - p, 3);
        const d = 1.05 + ease * 1.25;
        spark.current.position.set(L.sparkDir.x * d, L.sparkDir.y * d, 1.2);
        spark.current.scale.setScalar(0.09 * (1 - p * 0.5));
        (spark.current.material as THREE.MeshBasicMaterial).opacity = p < 0.85 ? 1 : (1 - p) / 0.15;
      }
    }

    if (dust.current) {
      dust.current.rotation.z += dt * (0.01 + L.spin * 0.2) + release * dt * 0.4;
      const mat = dust.current.material as THREE.PointsMaterial;
      // Dust only reads as atmosphere around a large core; at thumbnail size it is noise.
      const px = L.scale * SYSTEM_EXTENT * 2;
      const sizeFade = Math.min(1, Math.max(0, (px - 150) / 130));
      mat.opacity = (0.5 + save * 0.3 - release * 0.25) * sizeFade;
      dust.current.visible = sizeFade > 0.01;
    }
  });

  return (
    <group ref={root} visible={false}>
      {/* Soft halo behind everything */}
      <mesh position={[0, 0, -3]} renderOrder={-1}>
        <planeGeometry args={[7.2, 7.2]} />
        <shaderMaterial
          ref={haloMat}
          vertexShader={haloVertex}
          fragmentShader={haloFragment}
          uniforms={haloUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={tilt}>
        <mesh renderOrder={1}>
          <sphereGeometry args={[1.16, 48, 48]} />
          <shaderMaterial
            ref={atmoMat}
            vertexShader={atmosphereVertex}
            fragmentShader={atmosphereFragment}
            uniforms={atmoUniforms}
            side={THREE.BackSide}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[1, quality.segments, quality.segments]} />
          <shaderMaterial ref={orbMat} vertexShader={orbVertex} fragmentShader={orbFragment} uniforms={orbUniforms} />
        </mesh>

        <group ref={ringsSpin}>
          {/* Ring A — steep, descending to the right (as in the reference). */}
          <group rotation={[0, 0, -0.68]}>
            <group rotation={[1.12, 0, 0]}>
              <mesh ref={ringA}>
                <torusGeometry args={[RING_RADIUS, 0.014, 6, 220]} />
                <shaderMaterial vertexShader={ringVertex} fragmentShader={ringFragment} uniforms={ringAUniforms} transparent />
              </mesh>
              <mesh ref={moonB}>
                <sphereGeometry args={[0.035, 12, 12]} />
                <meshBasicMaterial color="#aeb4ff" />
              </mesh>
            </group>
          </group>
          {/* Ring B — wide, ascending to the right, carrying the bright moon. */}
          <group rotation={[0, 0, 0.36]}>
            <group rotation={[1.2, 0, 0]}>
              <mesh ref={ringB}>
                <torusGeometry args={[RING_RADIUS * 1.04, 0.016, 6, 220]} />
                <shaderMaterial vertexShader={ringVertex} fragmentShader={ringFragment} uniforms={ringBUniforms} transparent />
              </mesh>
              <mesh ref={moonA}>
                <sphereGeometry args={[0.07, 16, 16]} />
                <meshBasicMaterial color="#e9e2ff" />
              </mesh>
            </group>
          </group>
        </group>

        <mesh ref={pulse} visible={false}>
          <ringGeometry args={[1.02, 1.06, 96]} />
          <meshBasicMaterial color="#c9bfff" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh ref={spark} visible={false}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color="#f4f0ff" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#a8aef5" size={2.5} sizeAttenuation={false} transparent opacity={0.55} depthWrite={false} />
      </points>
    </group>
  );
}

/** Lowers the pixel ratio if the device struggles (auto quality only). */
function AdaptiveResolution({ enabled }: { enabled: boolean }) {
  const setDpr = useThree((s) => s.setDpr);
  const stats = useRef({ frames: 0, time: 0, lowered: false });
  useFrame((_, dt) => {
    if (!enabled || stats.current.lowered) return;
    const st = stats.current;
    st.frames++;
    st.time += dt;
    if (st.frames === 120) {
      const avg = st.time / st.frames;
      // Consistently below ~40 FPS → render at 1× to save fill rate.
      if (avg > 1 / 40) {
        setDpr(1);
        st.lowered = true;
      }
      st.frames = 0;
      st.time = 0;
    }
  });
  return null;
}

/**
 * Renders the scene clipped to the scrolling content region (the anchor's <main>),
 * so the orb never paints over the header or the bottom navigation while
 * content scrolls — the same clipping the DOM fallback gets from overflow.
 */
function ClippedRender() {
  useFrame(({ gl, scene, camera, size }) => {
    const el = coreStore.getState().anchorEl;
    const clip = el?.closest('main')?.getBoundingClientRect();
    gl.setScissorTest(false);
    gl.clear();
    if (clip) {
      const x = Math.max(0, clip.left);
      const y = Math.max(0, clip.top);
      const w = Math.max(0, Math.min(size.width, clip.right) - x);
      const h = Math.max(0, Math.min(size.height, clip.bottom) - y);
      gl.setScissorTest(true);
      // WebGL's origin is bottom-left; setScissor takes CSS pixels.
      gl.setScissor(x, size.height - (y + h), w, h);
    }
    gl.render(scene, camera);
    gl.setScissorTest(false);
  }, 1);
  return null;
}

function ReadySignal() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    coreStore.setState({ webglReady: true });
  });
  useEffect(() => () => coreStore.setState({ webglReady: false }), []);
  return null;
}

export interface CoreSceneProps {
  quality: GraphicsQuality;
  onFailure: (reason: string) => void;
}

export default function CoreScene({ quality, onFailure }: CoreSceneProps) {
  const profile = qualityProfile(quality);
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1000], near: 1, far: 4000, zoom: 1 }}
      dpr={profile.dpr}
      gl={{ antialias: true, alpha: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      aria-hidden="true"
      data-testid="core-canvas"
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        const canvas = gl.domElement;
        const onLost = (e: Event) => {
          e.preventDefault();
          onFailure('context-lost');
        };
        canvas.addEventListener('webglcontextlost', onLost, { once: true });
      }}
    >
      <CoreSystem quality={profile} />
      <ClippedRender />
      <AdaptiveResolution enabled={quality === 'auto'} />
      <ReadySignal />
    </Canvas>
  );
}

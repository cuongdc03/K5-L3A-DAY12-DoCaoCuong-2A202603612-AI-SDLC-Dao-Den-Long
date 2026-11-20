import * as THREE from 'three';
import { DT, SHADE_WANDER_SPEED, TUNING } from '../core/config';
import { NIGHT_MAPS } from '../core/maps';
import { SeededRNG } from '../core/prng';
import {
  createBambooHatTexture,
  createGlowSpriteTexture,
  createPainterlyGrassTexture,
  createPaperLanternTexture,
  createSkyDome,
  createTornLanternTexture,
} from './textures';

interface BenchShade {
  x: number;
  z: number;
  angle: number;
  changeTicks: number;
}

export function runBenchmarkMode(container: HTMLElement, seed: number, durationS: number): void {
  // Hide all game menus/HUD in bench mode
  for (const id of [
    'menu-screen',
    'intro-screen',
    'pause-screen',
    'settings-screen',
    'leaderboard-screen',
    'result-screen',
    'hud',
  ]) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1b2350, 0.0085);

  const camera = new THREE.PerspectiveCamera(52, 1280 / 720, 0.1, 420);
  camera.position.set(30, 15, 0);
  camera.lookAt(0, 0, 0);

  const sky = createSkyDome();
  scene.add(sky.mesh);

  // Night 1 lighting with 3/5 lanterns lit: ambient = 0.15 + 0.55 * (3/5) = 0.48
  const ambient = new THREE.AmbientLight(0xdce6ff, 0.15 + 0.55 * (3 / 5));
  scene.add(ambient);
  scene.add(new THREE.HemisphereLight(0x5a73a8, 0x2f5d50, 0.75));
  const moonLight = new THREE.DirectionalLight(0xdde8ff, 1.5);
  moonLight.position.set(35, 55, -25);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.left = -45;
  moonLight.shadow.camera.right = 45;
  moonLight.shadow.camera.top = 45;
  moonLight.shadow.camera.bottom = -45;
  scene.add(moonLight);

  // Night 1 island (Đảo Bến, R=40m)
  const grassTex = createPainterlyGrassTexture();
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 38.4, 2, 64),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9 }),
  );
  island.position.y = -1;
  island.receiveShadow = true;
  scene.add(island);

  // Mây stationary at (0, 0, 0)
  const may = new THREE.Group();
  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.05, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.7 }),
  );
  cloak.position.y = 0.56;
  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.08, 8, 14),
    new THREE.MeshStandardMaterial({ color: 0xc8102e }),
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.05;
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.74, 0.38, 16, 1, true),
    new THREE.MeshStandardMaterial({ map: createBambooHatTexture(), side: THREE.DoubleSide }),
  );
  hat.position.y = 1.62;
  may.add(cloak, scarf, hat);
  scene.add(may);

  // 5 Night 1 Lanterns: L1-L3 lit (fuel=100), L4-L5 unlit
  const paperTex = createPaperLanternTexture();
  const tornTex = createTornLanternTexture();
  const glowTex = createGlowSpriteTexture();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 });
  const litLanternCoords: Array<[number, number]> = [];

  for (let i = 0; i < NIGHT_MAPS[1].lanterns.length; i++) {
    const def = NIGHT_MAPS[1].lanterns[i];
    const isLit = i < 3;
    if (isLit) litLanternCoords.push([def.pos[0], def.pos[2]]);

    const lg = new THREE.Group();
    lg.position.set(def.pos[0], def.pos[1], def.pos[2]);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 3.1, 8), woodMat);
    pole.position.y = 1.8;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.55, 6), woodMat);
    roof.position.y = 4.15;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 12, 10),
      new THREE.MeshStandardMaterial({
        map: isLit ? paperTex : tornTex,
        color: isLit ? 0xffe9b0 : 0x5b5f6e,
        emissive: isLit ? 0xffb347 : 0x000000,
        emissiveIntensity: isLit ? 1.8 : 0,
      }),
    );
    bulb.scale.y = isLit ? 1.25 : 1.0;
    bulb.position.y = 3.35;
    lg.add(pole, roof, bulb);

    if (isLit) {
      const ptLight = new THREE.PointLight(0xffb347, 22, 26, 1.35);
      ptLight.position.set(0, 3.5, 0);
      lg.add(ptLight);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.position.set(0, 3.35, 0);
      halo.scale.set(5.5, 5.5, 1);
      lg.add(halo);
    }
    scene.add(lg);
  }

  // Deterministic RNG(seed) for 200 Shades + 100 Motes
  const rng = new SeededRNG(seed);

  // 100 Motes using InstancedMesh (1 draw call)
  const moteCount = 100;
  const moteGeo = new THREE.SphereGeometry(0.24, 8, 8);
  const moteMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2 });
  const moteInst = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < moteCount; i++) {
    const [mx, mz] = rng.pointInAnnulus(3, 37);
    dummy.position.set(mx, 0.9, mz);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    moteInst.setMatrixAt(i, dummy.matrix);
  }
  moteInst.instanceMatrix.needsUpdate = true;
  scene.add(moteInst);

  // 200 Shades in wander state using InstancedMesh (1 draw call)
  const shadeCount = 200;
  const shades: BenchShade[] = [];
  for (let i = 0; i < shadeCount; i++) {
    let sx = 0;
    let sz = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      [sx, sz] = rng.pointInAnnulus(4, 38);
      const inSafe = litLanternCoords.some(
        ([lx, lz]) => Math.hypot(sx - lx, sz - lz) < TUNING.safe_radius,
      );
      if (!inSafe) break;
    }
    shades.push({
      x: sx,
      z: sz,
      angle: rng.next() * Math.PI * 2,
      changeTicks: 30 + Math.floor(rng.next() * 90),
    });
  }

  const shadeGeo = new THREE.SphereGeometry(0.6, 10, 10);
  shadeGeo.scale(1, 1.25, 1);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0x120a1a,
    emissive: 0x7a3cff,
    emissiveIntensity: 0.7,
    roughness: 0.55,
  });
  const shadeInst = new THREE.InstancedMesh(shadeGeo, shadeMat, shadeCount);
  scene.add(shadeInst);

  // Detect WebGL renderer info
  let rendererInfo = `Three.js ${THREE.REVISION} WebGL2`;
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      rendererInfo = `Three.js r${THREE.REVISION} (${gpu})`;
    }
  } catch {
    // fallback
  }

  const warmupS = 3.0;
  let loadMs = 0;
  let firstFrame = true;
  let startTime = 0;
  let prevTime = 0;
  let accum = 0;
  const dts: number[] = [];
  let finished = false;

  const stepShades = () => {
    for (let i = 0; i < shadeCount; i++) {
      const s = shades[i];
      s.changeTicks -= 1;
      if (s.changeTicks <= 0) {
        s.angle = rng.next() * Math.PI * 2;
        s.changeTicks = 60 + Math.floor(rng.next() * 90);
      }
      let nx = s.x + Math.cos(s.angle) * SHADE_WANDER_SPEED * DT;
      let nz = s.z + Math.sin(s.angle) * SHADE_WANDER_SPEED * DT;

      // Stay outside lit lantern safe zones (6m)
      for (const [lx, lz] of litLanternCoords) {
        const dx = nx - lx;
        const dz = nz - lz;
        const d = Math.hypot(dx, dz);
        if (d < TUNING.safe_radius) {
          const r = TUNING.safe_radius + 0.05;
          nx = lx + (d > 1e-6 ? (dx / d) * r : r);
          nz = lz + (d > 1e-6 ? (dz / d) * r : 0);
          s.angle += Math.PI * 0.5;
        }
      }

      if (Math.hypot(nx, nz) <= 39.2) {
        s.x = nx;
        s.z = nz;
      } else {
        s.angle += Math.PI * 0.75;
      }
    }
  };

  const finishBench = () => {
    if (finished) return;
    finished = true;

    const N = dts.length;
    const sumDt = dts.reduce((a, b) => a + b, 0);
    const avgFps = N > 0 && sumDt > 0 ? (1000 * N) / sumDt : 0;

    const sortedDesc = [...dts].sort((a, b) => b - a);
    const k = Math.max(1, Math.ceil(0.01 * N));
    const topKSum = sortedDesc.slice(0, k).reduce((a, b) => a + b, 0);
    const p1LowFps = topKSum > 0 ? 1000 / (topKSum / k) : 0;

    const sortedAsc = [...dts].sort((a, b) => a - b);
    const p95Idx = Math.min(N - 1, Math.floor(0.95 * (N - 1)));
    const frameMsP95 = N > 0 ? sortedAsc[p95Idx] : 0;

    fetch('/__bench_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avg_fps: avgFps,
        p1_low_fps: p1LowFps,
        frame_ms_p95: frameMsP95,
        frames: N,
        load_ms: Math.round(loadMs),
        renderer: rendererInfo,
      }),
    }).catch(() => {});
  };

  const loop = (now: number) => {
    if (finished) return;
    requestAnimationFrame(loop);

    if (firstFrame) {
      firstFrame = false;
      loadMs = performance.now();
      startTime = now;
      prevTime = now;
    }

    const dtMs = now - prevTime;
    prevTime = now;
    const elapsedS = (now - startTime) / 1000;

    // 60Hz shade wander
    accum += Math.min(0.1, dtMs / 1000);
    while (accum >= DT) {
      stepShades();
      accum -= DT;
    }

    for (let i = 0; i < shadeCount; i++) {
      const s = shades[i];
      dummy.position.set(s.x, 1.1, s.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, -s.angle, 0);
      dummy.updateMatrix();
      shadeInst.setMatrixAt(i, dummy.matrix);
    }
    shadeInst.instanceMatrix.needsUpdate = true;

    // Camera orbits (0,0,0), R=30m, Y=15m, starting at 0 deg (30,15,0), CCW 15s per revolution
    const camAngle = (elapsedS / 15.0) * Math.PI * 2;
    camera.position.set(Math.cos(camAngle) * 30, 15, Math.sin(camAngle) * 30);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    if (elapsedS >= warmupS) {
      if (dtMs > 0) dts.push(dtMs);
      if (elapsedS >= warmupS + durationS) {
        finishBench();
      }
    }
  };

  requestAnimationFrame(loop);
}

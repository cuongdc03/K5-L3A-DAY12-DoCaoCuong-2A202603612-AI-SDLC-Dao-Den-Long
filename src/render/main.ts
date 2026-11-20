import * as THREE from 'three';
import { DT, ISLAND_RADIUS, TUNING } from '../core/config';
import { createDefaultInputState, distXZ, GameSimulation } from '../core/simulation';
import type { EventRecord, InputState } from '../core/types';
import { SoundEngine } from './audio';
import {
  createBambooHatTexture,
  createGlowSpriteTexture,
  createPainterlyGrassTexture,
  createPaperLanternTexture,
  createSkyDome,
} from './textures';

interface LanternVisual {
  group: THREE.Group;
  bulbMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  halo: THREE.Sprite;
  safeRing: THREE.Mesh;
  pipMeshes: THREE.Mesh[];
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  wisps: THREE.Mesh[];
  eyeMat: THREE.MeshBasicMaterial;
}

interface MoteVisual {
  group: THREE.Group;
  halo: THREE.Sprite;
}

class DaoDenLongApp {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private skyUniforms!: {
    uTopColor: { value: THREE.Color };
    uMidColor: { value: THREE.Color };
    uBottomColor: { value: THREE.Color };
  };

  private sim: GameSimulation;
  private sound = new SoundEngine();

  private playerGroup!: THREE.Group;
  private playerBodyGroup!: THREE.Group;
  private hatLanternPivot!: THREE.Group;
  private hatLanternLight!: THREE.PointLight;

  private warmGlowTex!: THREE.CanvasTexture;
  private paperLanternTex!: THREE.CanvasTexture;

  private lanternVisuals = new Map<string, LanternVisual>();
  private moteVisuals = new Map<string, MoteVisual>();
  private shadeVisuals = new Map<string, ShadeVisual>();
  private clouds: THREE.Group[] = [];
  private ambientDust!: THREE.Points;
  private pulseWaves: Array<{ mesh: THREE.Mesh; age: number }> = [];

  private keys = new Set<string>();
  private camYawDeg = 0;
  private isRightDragging = false;
  private lastMouseX = 0;
  private cameraShake = 0;
  private accumulator = 0;
  private lastTime = performance.now();
  private elapsedVisual = 0;

  // HUD elements
  private hudFlames = document.getElementById('hud-flames')!;
  private hudCarried = document.getElementById('hud-carried')!;
  private hudLanterns = document.getElementById('hud-lanterns')!;
  private hudPulse = document.getElementById('hud-pulse')!;
  private hudTime = document.getElementById('hud-time')!;
  private hudScore = document.getElementById('hud-score')!;
  private promptBanner = document.getElementById('prompt-banner')!;
  private overlay = document.getElementById('overlay')!;
  private overlayTitle = document.getElementById('overlay-title')!;
  private overlayDesc = document.getElementById('overlay-desc')!;
  private overlayScore = document.getElementById('overlay-score')!;
  private restartBtn = document.getElementById('restart-btn')!;
  private audioBtn = document.getElementById('audio-btn')!;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1f3652, 0.0105);

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
      360,
    );

    // Painterly Ghibli-inspired sky dome
    const sky = createSkyDome();
    this.skyUniforms = sky.uniforms;
    this.scene.add(sky.mesh);

    // Soft fairy-tale moon + sky/ground hemisphere fill (PBR intensities)
    this.hemiLight = new THREE.HemisphereLight(0x8ec5e8, 0x355c47, 1.15);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xd8ecff, 1.75);
    this.moonLight.position.set(28, 46, -24);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.bias = -0.0005;
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 140;
    this.moonLight.shadow.camera.left = -46;
    this.moonLight.shadow.camera.right = 46;
    this.moonLight.shadow.camera.top = 46;
    this.moonLight.shadow.camera.bottom = -46;
    this.scene.add(this.moonLight);

    this.warmGlowTex = createGlowSpriteTexture(
      'rgba(255, 250, 224, 1)',
      'rgba(255, 198, 92, 0.55)',
      'rgba(255, 145, 45, 0)',
    );
    this.paperLanternTex = createPaperLanternTexture();

    this.buildWorld();
    this.buildPlayer();

    this.sim = new GameSimulation({ seed: 2026, night: 1 });
    this.syncEntities(true);
    this.bindEvents();
    this.animate();
  }

  private buildWorld(): void {
    // Round island (Đảo Bến) with painterly watercolor grass at Y = 0
    const grassTex = createPainterlyGrassTexture();
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.96, 1.6, 72);
    const topMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.9,
      metalness: 0.0,
    });
    const islandTop = new THREE.Mesh(topGeo, topMat);
    islandTop.position.y = -0.8;
    islandTop.receiveShadow = true;
    this.scene.add(islandTop);

    // Floating mossy cliff underside
    const cliffGeo = new THREE.ConeGeometry(ISLAND_RADIUS * 0.95, 16, 28);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x3b4954,
      roughness: 0.95,
      flatShading: true,
    });
    const cliff = new THREE.Mesh(cliffGeo, cliffMat);
    cliff.rotation.x = Math.PI;
    cliff.position.y = -9.6;
    this.scene.add(cliff);

    // Warm cream stepping-stone ring path connecting the 5 lanterns
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc9bfa8, roughness: 0.92 });
    const stoneGeo = new THREE.CylinderGeometry(1.15, 1.3, 0.08, 9);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = 25 + Math.sin(i * 1.7) * 0.45;
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
      stone.scale.set(0.85 + (i % 3) * 0.14, 1, 0.75 + ((i + 1) % 3) * 0.14);
      stone.rotation.y = a + i * 0.5;
      stone.receiveShadow = true;
      this.scene.add(stone);
    }

    // Center sanctuary stone plaza at (0, 0, 0)
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 5.1, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: 0xd4cab3, roughness: 0.88 }),
    );
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Stylized meadow grass tufts (InstancedMesh for high performance + Hoa lushness)
    const tuftCount = 340;
    const tuftGeo = new THREE.ConeGeometry(0.18, 0.72, 4);
    tuftGeo.translate(0, 0.36, 0);
    const tuftMat = new THREE.MeshStandardMaterial({
      color: 0x5ea879,
      roughness: 0.85,
      flatShading: true,
    });
    const grassInstances = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < tuftCount; i++) {
      const a = (i * 137.508 * Math.PI) / 180;
      const r = 5.5 + Math.sqrt((i + 0.5) / tuftCount) * (ISLAND_RADIUS - 7.5);
      // Skip directly on the stepping-stone ring
      const finalR = Math.abs(r - 25) < 1.8 ? r + 2.4 : r;
      dummy.position.set(Math.cos(a) * finalR, 0, Math.sin(a) * finalR);
      dummy.rotation.set((i % 5 - 2) * 0.08, a, ((i * 3) % 5 - 2) * 0.08);
      const s = 0.65 + (i % 7) * 0.12;
      dummy.scale.set(s, s * (0.85 + (i % 4) * 0.15), s);
      dummy.updateMatrix();
      grassInstances.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.38 + (i % 5) * 0.012, 0.42, 0.42 + (i % 4) * 0.05);
      grassInstances.setColorAt(i, color);
    }
    grassInstances.instanceMatrix.needsUpdate = true;
    if (grassInstances.instanceColor) grassInstances.instanceColor.needsUpdate = true;
    this.scene.add(grassInstances);

    // Ghibli-style rounded canopy trees & glowing mushrooms near island rim
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3d, roughness: 0.92 });
    const canopyPalette = [0x3d8267, 0x4e9674, 0x2f6d5c, 0x62a87c];
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x6f7f82,
      roughness: 0.95,
      flatShading: true,
    });
    const mushCapMat = new THREE.MeshStandardMaterial({
      color: 0xffd28a,
      emissive: 0xffa63d,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    });

    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + 0.18;
      const r = ISLAND_RADIUS - 3.6 - (i % 3) * 1.4;
      const tree = new THREE.Group();

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 2.5, 8), trunkMat);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      tree.add(trunk);

      const leafMat = new THREE.MeshStandardMaterial({
        color: canopyPalette[i % canopyPalette.length],
        roughness: 0.84,
      });
      const puffs: Array<[number, number, number, number]> = [
        [0, 3.2, 0, 1.85],
        [-1.0, 2.7, 0.5, 1.3],
        [1.05, 2.8, -0.4, 1.35],
        [0.15, 4.2, 0.2, 1.25],
      ];
      for (const [px, py, pz, pr] of puffs) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 2), leafMat);
        puff.position.set(px, py, pz);
        puff.scale.y = 0.82;
        puff.castShadow = true;
        puff.receiveShadow = true;
        tree.add(puff);
      }

      // Mossy rock & tiny glowing mushroom at tree base
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 + (i % 2) * 0.25, 0), rockMat);
      rock.position.set(1.1, 0.28, 0.8);
      rock.scale.y = 0.6;
      tree.add(rock);

      if (i % 2 === 0) {
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.08, 0.35, 6),
          new THREE.MeshStandardMaterial({ color: 0xf5ebd6, roughness: 0.8 }),
        );
        stem.position.set(-0.9, 0.18, 0.9);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mushCapMat);
        cap.position.set(-0.9, 0.34, 0.9);
        tree.add(stem, cap);
      }

      tree.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      tree.rotation.y = angle;
      this.scene.add(tree);
    }

    // Soft glowing fairy-tale moon in the sky
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(8.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff5d6 }),
    );
    moon.position.set(55, 72, -85);
    this.scene.add(moon);

    const moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowSpriteTexture(
          'rgba(255, 250, 224, 0.85)',
          'rgba(186, 222, 255, 0.32)',
          'rgba(120, 170, 255, 0)',
        ),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    moonHalo.position.copy(moon.position);
    moonHalo.scale.set(42, 42, 1);
    this.scene.add(moonHalo);

    // Sea of billowing pastel-moonlit clouds around Đảo Bến
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xdbe9f6,
      emissive: 0x3b5375,
      emissiveIntensity: 0.45,
      roughness: 1,
      transparent: true,
      opacity: 0.78,
    });
    for (let i = 0; i < 28; i++) {
      const cluster = new THREE.Group();
      const angle = (i / 28) * Math.PI * 2;
      const dist = ISLAND_RADIUS + 14 + (i % 3) * 11;
      for (let p = 0; p < 4; p++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3.8 + (p % 2) * 1.8, 2), cloudMat);
        puff.position.set((p - 1.5) * 3.8, (p % 2) * 1.1, ((p + 1) % 2) * 2.1);
        puff.scale.y = 0.5;
        cluster.add(puff);
      }
      cluster.position.set(Math.cos(angle) * dist, -5.2 - (i % 3) * 1.8, Math.sin(angle) * dist);
      cluster.userData = { angle, dist, speed: 0.012 + (i % 4) * 0.003 };
      this.scene.add(cluster);
      this.clouds.push(cluster);
    }

    // Ambient fairy-tale floating pollen / starlight dust
    const dustCount = 240;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = (i * 137.5 * Math.PI) / 180;
      const r = 3 + Math.sqrt((i + 1) / dustCount) * (ISLAND_RADIUS + 4);
      dustPositions[i * 3] = Math.cos(a) * r;
      dustPositions[i * 3 + 1] = 0.6 + (i % 15) * 0.75;
      dustPositions[i * 3 + 2] = Math.sin(a) * r;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffe8a6,
      size: 0.45,
      map: this.warmGlowTex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ambientDust = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.ambientDust);
  }

  private buildPlayer(): void {
    // Mây: Hoa-inspired leaf cloak + Vietnamese conical hat (nón lá) + hanging paper lantern
    this.playerGroup = new THREE.Group();
    this.playerBodyGroup = new THREE.Group();
    this.playerGroup.add(this.playerBodyGroup);

    // Leaf cloak (soft jade-teal like Hoa)
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0x4ca687, roughness: 0.65 });
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.05, 16), cloakMat);
    dress.position.y = 0.56;
    dress.castShadow = true;
    this.playerBodyGroup.add(dress);

    // Warm cream scarf / collar
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.08, 10, 18),
      new THREE.MeshStandardMaterial({ color: 0xfff0cc, roughness: 0.75 }),
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.05;
    this.playerBodyGroup.add(scarf);

    // Cute rounded head + dark eyes
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffe3c4, roughness: 0.55 }),
    );
    head.position.y = 1.28;
    head.castShadow = true;
    this.playerBodyGroup.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x24192b });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), eyeMat);
    eyeL.position.set(-0.09, 1.29, 0.24);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    this.playerBodyGroup.add(eyeL, eyeR);

    // Woven bamboo conical hat (nón lá)
    const hatMat = new THREE.MeshStandardMaterial({
      map: createBambooHatTexture(),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.74, 0.38, 24, 1, true), hatMat);
    hat.position.y = 1.62;
    hat.castShadow = true;
    this.playerBodyGroup.add(hat);

    // Small warm lantern hanging gently from the front brim of the hat
    this.hatLanternPivot = new THREE.Group();
    this.hatLanternPivot.position.set(0, 1.44, 0.66);
    this.playerBodyGroup.add(this.hatLanternPivot);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: 0x6e4a2e }),
    );
    cord.position.y = -0.12;
    this.hatLanternPivot.add(cord);

    const smallLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({
        map: this.paperLanternTex,
        emissive: 0xffa733,
        emissiveIntensity: 1.8,
        roughness: 0.3,
      }),
    );
    smallLantern.scale.y = 1.22;
    smallLantern.position.y = -0.28;
    this.hatLanternPivot.add(smallLantern);

    const smallHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85,
      }),
    );
    smallHalo.position.y = -0.28;
    smallHalo.scale.set(0.95, 0.95, 1);
    this.hatLanternPivot.add(smallHalo);

    this.hatLanternLight = new THREE.PointLight(0xffb85c, 5.5, 13, 1.6);
    this.hatLanternLight.position.set(0, -0.25, 0);
    this.hatLanternPivot.add(this.hatLanternLight);

    this.scene.add(this.playerGroup);
  }

  private createLanternVisual(id: string): LanternVisual {
    const group = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4735, roughness: 0.85 });
    const stoneBaseMat = new THREE.MeshStandardMaterial({ color: 0xc2b9a5, roughness: 0.9 });

    // Stone pedestal
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 0.45, 8), stoneBaseMat);
    pedestal.position.y = 0.225;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;

    // Carved wooden pillar + pagoda-like tiered roof
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 3.1, 10), woodMat);
    pole.position.y = 1.8;
    pole.castShadow = true;

    const eaveLower = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.55, 6), woodMat);
    eaveLower.position.y = 4.15;
    eaveLower.castShadow = true;

    const eaveUpper = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 6), woodMat);
    eaveUpper.position.y = 4.65;
    eaveUpper.castShadow = true;

    const bulbMat = new THREE.MeshStandardMaterial({
      map: this.paperLanternTex,
      color: 0x777087,
      emissive: 0x261d36,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), bulbMat);
    bulb.scale.y = 1.25;
    bulb.position.y = 3.35;
    group.add(pedestal, pole, eaveLower, eaveUpper, bulb);

    const light = new THREE.PointLight(0xffb554, 0, 28, 1.35);
    light.position.set(0, 3.5, 0);
    group.add(light);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.set(0, 3.35, 0);
    halo.scale.set(5.5, 5.5, 1);
    group.add(halo);

    // Gentle golden safe-zone ring on ground (safe_radius = 6m)
    const safeGeo = new THREE.RingGeometry(TUNING.safe_radius - 0.16, TUNING.safe_radius, 56);
    const safeMat = new THREE.MeshBasicMaterial({
      color: 0xffd57e,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const safeRing = new THREE.Mesh(safeGeo, safeMat);
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.06;
    group.add(safeRing);

    // Floating firefly progress pips orbiting the lantern base
    const pipMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < TUNING.lantern_cost; i++) {
      const pip = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0x5c5870,
          emissive: 0x000000,
          emissiveIntensity: 0,
        }),
      );
      group.add(pip);
      pipMeshes.push(pip);
    }

    this.scene.add(group);
    const visual: LanternVisual = { group, bulbMat, light, halo, safeRing, pipMeshes };
    this.lanternVisuals.set(id, visual);
    return visual;
  }

  private createMoteVisual(id: string): MoteVisual {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff8d6 }),
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.set(1.7, 1.7, 1);
    group.add(core, halo);
    this.scene.add(group);
    const visual: MoteVisual = { group, halo };
    this.moteVisuals.set(id, visual);
    return visual;
  }

  private createShadeVisual(id: string): ShadeVisual {
    // Ghibli-like ink spirit: soft drifting soot/ink droplets with gentle lavender eyes
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a0e2e,
      emissive: 0x45176e,
      emissiveIntensity: 0.65,
      roughness: 0.55,
    });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 16), bodyMat);
    core.position.y = 1.2;
    core.scale.set(1, 1.25, 1);
    core.castShadow = true;
    group.add(core);

    const wisps: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.32 - i * 0.05, 10, 10), bodyMat);
      wisp.position.set(0, 0.72 - i * 0.14, -0.25 - i * 0.16);
      group.add(wisp);
      wisps.push(wisp);
    }

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xdfa6ff });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), eyeMat);
    eyeL.position.set(-0.2, 1.32, 0.54);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.2;
    group.add(eyeL, eyeR);

    this.scene.add(group);
    const visual: ShadeVisual = { group, bodyMat, wisps, eyeMat };
    this.shadeVisuals.set(id, visual);
    return visual;
  }

  private spawnPulseWave(): void {
    const geo = new THREE.RingGeometry(0.35, 0.9, 56);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.sim.player.x, 0.22, this.sim.player.z);
    this.scene.add(mesh);
    this.pulseWaves.push({ mesh, age: 0 });
  }

  private handleEvents(events: EventRecord[]): void {
    for (const ev of events) {
      switch (ev.name) {
        case 'mote_picked':
          this.sound.playMotePickup();
          break;
        case 'deposit':
          this.sound.playDeposit();
          break;
        case 'lantern_lit':
          this.sound.playLanternLit();
          break;
        case 'pulse':
          this.sound.playPulse();
          this.spawnPulseWave();
          this.cameraShake = Math.min(1, this.cameraShake + 0.35);
          break;
        case 'player_hit':
          this.sound.playHit();
          this.cameraShake = Math.min(1, this.cameraShake + 0.7);
          break;
        case 'game_over': {
          const res = ev.data.result as string;
          const reason = ev.data.reason as string;
          if (res === 'won') {
            this.sound.playWin();
            this.overlayTitle.textContent = 'Đảo Bến Đã Sáng!';
            this.overlayDesc.textContent =
              'Mây đã thắp sáng toàn bộ 5 Đèn Lồng Lớn và đánh thức ánh ấm cổ tích trên đảo.';
          } else {
            this.sound.playLose();
            this.overlayTitle.textContent =
              reason === 'dawn' ? 'Hết Thời Gian Đêm 1' : 'Ngọn Lửa Đã Tắt';
            this.overlayDesc.textContent =
              reason === 'dawn'
                ? 'Bình minh đã tới trước khi tất cả Đèn Lồng kịp sáng.'
                : 'Mây đã mất hết ngọn lửa trước Bóng Mực. Hãy thử lại nhé!';
          }
          this.overlayScore.textContent = `Tổng điểm: ${this.sim.score}`;
          this.overlay.classList.add('visible');
          break;
        }
      }
    }
  }

  private syncEntities(initial = false): void {
    // Player transform + gentle run bob / squash-and-stretch
    this.playerGroup.position.set(this.sim.player.x, this.sim.player.y, this.sim.player.z);
    this.playerGroup.rotation.y = this.sim.player.facingYaw;

    const isMoving =
      this.keys.has('KeyW') ||
      this.keys.has('KeyA') ||
      this.keys.has('KeyS') ||
      this.keys.has('KeyD') ||
      this.keys.has('ArrowUp') ||
      this.keys.has('ArrowDown') ||
      this.keys.has('ArrowLeft') ||
      this.keys.has('ArrowRight');
    const bob = isMoving && this.sim.player.y <= 0.01 ? Math.abs(Math.sin(this.elapsedVisual * 11)) * 0.09 : 0;
    this.playerBodyGroup.position.y = bob;
    const stretch = this.sim.player.y > 0.05 ? 1.07 : 1.0 - bob * 0.25;
    this.playerBodyGroup.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    this.hatLanternPivot.rotation.z = Math.sin(this.elapsedVisual * 4.5) * (isMoving ? 0.16 : 0.05);
    this.hatLanternLight.intensity =
      5.0 + Math.min(this.sim.player.carried, TUNING.carry_capacity) * 0.85;

    // Lanterns
    let litCount = 0;
    let nearUnlit = false;
    for (const lantern of this.sim.lanterns) {
      let vis = this.lanternVisuals.get(lantern.id);
      if (!vis) {
        vis = this.createLanternVisual(lantern.id);
      }
      vis.group.position.set(lantern.x, lantern.y, lantern.z);

      if (lantern.lit) {
        litCount++;
        vis.bulbMat.color.setHex(0xffe8b0);
        vis.bulbMat.emissive.setHex(0xff9f2e);
        vis.bulbMat.emissiveIntensity = 1.9 + Math.sin(this.elapsedVisual * 2.8 + lantern.x) * 0.18;
        vis.light.intensity = 24;
        (vis.halo.material as THREE.SpriteMaterial).opacity =
          0.72 + Math.sin(this.elapsedVisual * 2.5 + lantern.z) * 0.1;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0.3;
      } else {
        const frac = lantern.deposited / TUNING.lantern_cost;
        vis.bulbMat.color.setHex(0x8c849e);
        vis.bulbMat.emissive.setHex(0x472f4a);
        vis.bulbMat.emissiveIntensity = 0.25 + frac * 0.85;
        vis.light.intensity = frac * 6;
        (vis.halo.material as THREE.SpriteMaterial).opacity = frac * 0.35;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0;

        if (
          this.sim.player.carried > 0 &&
          distXZ(this.sim.player.x, this.sim.player.z, lantern.x, lantern.z) <= TUNING.interact_radius
        ) {
          nearUnlit = true;
        }
      }

      vis.pipMeshes.forEach((pip, idx) => {
        const angle = (idx / TUNING.lantern_cost) * Math.PI * 2 + this.elapsedVisual * 0.7;
        pip.position.set(
          Math.cos(angle) * 1.25,
          0.95 + Math.sin(this.elapsedVisual * 2.5 + idx) * 0.15,
          Math.sin(angle) * 1.25,
        );
        const mat = pip.material as THREE.MeshStandardMaterial;
        if (idx < lantern.deposited || lantern.lit) {
          mat.color.setHex(0xffe599);
          mat.emissive.setHex(0xffa733);
          mat.emissiveIntensity = 1.8;
        } else {
          mat.color.setHex(0x5c5870);
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      });
    }

    // Smooth Hoa-like transition from misty blue night -> warm golden fairy-tale glow
    const progress = litCount / Math.max(1, this.sim.lanterns.length);
    this.skyUniforms.uTopColor.value
      .setHex(0x0d1b38)
      .lerp(new THREE.Color(0x2d2b5c), progress);
    this.skyUniforms.uMidColor.value
      .setHex(0x213a5c)
      .lerp(new THREE.Color(0x7c5472), progress);
    this.skyUniforms.uBottomColor.value
      .setHex(0x3a5d73)
      .lerp(new THREE.Color(0xf0b27a), progress);

    this.hemiLight.intensity = 1.15 + progress * 0.65;
    this.hemiLight.color.setHex(0x8ec5e8).lerp(new THREE.Color(0xffe0ad), progress);
    this.moonLight.intensity = 1.75 + progress * 0.7;
    this.moonLight.color.setHex(0xd8ecff).lerp(new THREE.Color(0xffdfa8), progress);

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(0x1f3652).lerp(new THREE.Color(0x73596d), progress);
    fog.density = 0.0105 - progress * 0.0045;

    // Motes (glowing fireflies floating gently)
    const activeMoteIds = new Set(this.sim.motes.map((m) => m.id));
    for (const [id, vis] of this.moteVisuals.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(vis.group);
        this.moteVisuals.delete(id);
      }
    }
    for (const mote of this.sim.motes) {
      let vis = this.moteVisuals.get(mote.id);
      if (!vis) {
        vis = this.createMoteVisual(mote.id);
      }
      const hoverY = 0.92 + Math.sin(this.elapsedVisual * 2.8 + mote.x * 0.6 + mote.z * 0.4) * 0.24;
      vis.group.position.set(mote.x, hoverY, mote.z);
      const pulseScale = 1.55 + Math.sin(this.elapsedVisual * 4 + mote.x) * 0.25;
      vis.halo.scale.set(pulseScale, pulseScale, 1);
    }

    // Shades
    const activeShadeIds = new Set(this.sim.shades.map((s) => s.id));
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }
    for (const shade of this.sim.shades) {
      let vis = this.shadeVisuals.get(shade.id);
      if (!vis) {
        vis = this.createShadeVisual(shade.id);
      }
      const bobY = Math.sin(this.elapsedVisual * 3.6 + shade.x) * 0.14;
      vis.group.position.set(shade.x, shade.y + bobY, shade.z);
      vis.group.lookAt(this.sim.player.x, shade.y + 1.1, this.sim.player.z);

      vis.wisps.forEach((w, idx) => {
        w.position.x = Math.sin(this.elapsedVisual * 5 + idx * 1.1) * 0.12;
      });

      if (shade.state === 'stunned') {
        vis.bodyMat.emissive.setHex(0xffc966);
        vis.bodyMat.emissiveIntensity = 1.5;
        vis.eyeMat.color.setHex(0xfff4c2);
      } else {
        vis.bodyMat.emissive.setHex(0x45176e);
        vis.bodyMat.emissiveIntensity = 0.7;
        vis.eyeMat.color.setHex(0xdfa6ff);
      }
    }

    // Update HUD
    this.hudFlames.textContent =
      this.sim.player.flames > 0 ? '🔥'.repeat(this.sim.player.flames) : '—';
    this.hudCarried.textContent = `${this.sim.player.carried} / ${TUNING.carry_capacity}`;
    this.hudLanterns.textContent = `${litCount} / ${this.sim.lanterns.length}`;
    if (this.sim.player.pulseCooldown > 0) {
      this.hudPulse.textContent = `Hồi ${this.sim.player.pulseCooldown.toFixed(1)}s`;
    } else if (this.sim.player.carried < TUNING.pulse_cost) {
      this.hudPulse.textContent = 'Cần 1 đom đóm';
    } else {
      this.hudPulse.textContent = 'Sẵn sàng [Shift]';
    }

    const totalSec = Math.ceil(this.sim.timeLeftS);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    this.hudTime.textContent = `${mm}:${ss}`;
    this.hudScore.textContent = String(this.sim.score);

    this.promptBanner.style.display =
      !initial && this.sim.state === 'playing' && nearUnlit ? 'block' : 'none';
  }

  private pollInput(): InputState {
    const input = createDefaultInputState();
    let mx = 0;
    let mz = 0;
    // Camera looks toward +Z when cam_yaw_deg = 0.
    // In right-handed coordinates (+Y up), screen-right is -X and screen-left is +X.
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;

    if (this.keys.has('KeyQ')) this.camYawDeg += 1.8;
    if (this.keys.has('KeyE')) this.camYawDeg -= 1.8;

    input.move = [mx, mz];
    input.cam_yaw_deg = this.camYawDeg;
    input.jump = this.keys.has('Space');
    input.interact = this.keys.has('KeyF') || this.keys.has('Enter');
    input.pulse =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyK');
    return input;
  }

  private updateCamera(frameDt: number): void {
    const theta = (this.camYawDeg * Math.PI) / 180;
    const forwardX = Math.sin(theta);
    const forwardZ = Math.cos(theta);
    const dist = 12.2;
    const height = 6.8;

    const targetPos = new THREE.Vector3(
      this.sim.player.x - forwardX * dist,
      this.sim.player.y + height,
      this.sim.player.z - forwardZ * dist,
    );
    const smooth = 1 - Math.exp(-8 * frameDt);
    this.camera.position.lerp(targetPos, smooth);

    if (this.cameraShake > 0.001) {
      const mag = this.cameraShake * this.cameraShake * 0.45;
      this.camera.position.x += Math.sin(this.elapsedVisual * 55) * mag;
      this.camera.position.y += Math.cos(this.elapsedVisual * 47) * mag;
      this.cameraShake = Math.max(0, this.cameraShake - frameDt * 2.4);
    }

    this.camera.lookAt(this.sim.player.x, this.sim.player.y + 1.5, this.sim.player.z);
  }

  private restart(): void {
    this.overlay.classList.remove('visible');
    const nextSeed = (this.sim.seed + 1) >>> 0;
    this.sim = new GameSimulation({ seed: nextSeed, night: 1 });
    this.syncEntities(true);
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyR' && this.sim.state !== 'playing') {
        this.restart();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.isRightDragging = true;
        this.lastMouseX = e.clientX;
      }
    });
    window.addEventListener('mouseup', () => {
      this.isRightDragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.isRightDragging) {
        const dx = e.clientX - this.lastMouseX;
        this.lastMouseX = e.clientX;
        this.camYawDeg -= dx * 0.35;
      }
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.restartBtn.addEventListener('click', () => this.restart());
    this.audioBtn.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      this.audioBtn.textContent = `Âm thanh: ${this.sound.enabled ? 'Bật' : 'Tắt'}`;
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsedVisual += frameDt;

    this.accumulator += frameDt;
    while (this.accumulator >= DT) {
      if (this.sim.state === 'playing') {
        const input = this.pollInput();
        const events = this.sim.step(input);
        if (events.length > 0) {
          this.handleEvents(events);
        }
      }
      this.accumulator -= DT;
    }

    // Drift sea of clouds & floating ambient dust
    for (const c of this.clouds) {
      c.userData.angle += c.userData.speed * frameDt;
      c.position.x = Math.cos(c.userData.angle) * c.userData.dist;
      c.position.z = Math.sin(c.userData.angle) * c.userData.dist;
    }
    this.ambientDust.rotation.y += frameDt * 0.02;
    this.ambientDust.position.y = Math.sin(this.elapsedVisual * 0.6) * 0.35;

    // Animate pulse waves
    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const wave = this.pulseWaves[i];
      wave.age += frameDt;
      const t = wave.age / 0.45;
      if (t >= 1) {
        this.scene.remove(wave.mesh);
        this.pulseWaves.splice(i, 1);
      } else {
        const scale = 1 + t * (TUNING.pulse_radius * 1.15);
        wave.mesh.scale.set(scale, scale, 1);
        (wave.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      }
    }

    this.syncEntities(false);
    this.updateCamera(frameDt);
    this.renderer.render(this.scene, this.camera);
  };
}

const container = document.getElementById('canvas-container');
if (container) {
  new DaoDenLongApp(container);
}

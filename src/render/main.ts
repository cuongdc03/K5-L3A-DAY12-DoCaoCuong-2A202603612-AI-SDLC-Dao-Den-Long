import * as THREE from 'three';
import { DT, FUEL_MAX_60, LOW_FUEL_THRESHOLD_60, TICK_RATE, TUNING } from '../core/config';
import { BELL_TOWER_RADIUS, NIGHT_MAPS } from '../core/maps';
import { createDefaultInputState, distXZ, GameSimulation } from '../core/simulation';
import type { EventRecord, InputState, NightId } from '../core/types';
import { SoundEngine } from './audio';
import {
  createBambooHatTexture,
  createGlowSpriteTexture,
  createPainterlyGrassTexture,
  createPaperLanternTexture,
  createSkyDome,
  createTornLanternTexture,
} from './textures';

// Standard Color Palette (TICKET-02 Part 3)
const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternUnlit: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeRimColorblind: 0x00b3ff,
  shadeStunned: 0x3a3450,
  mayCloak: 0xe8e2d0,
  mayScarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
};

interface LanternVisual {
  group: THREE.Group;
  bulb: THREE.Mesh;
  bulbMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  halo: THREE.Sprite;
  safeRing: THREE.Mesh;
  fuelBarGroup: THREE.Group;
  fuelBarFill: THREE.Mesh;
  fuelBarMat: THREE.MeshBasicMaterial;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  wisps: THREE.Mesh[];
  eyeMat: THREE.MeshBasicMaterial;
}

interface DrifterVisual {
  group: THREE.Group;
  ribbonSegments: THREE.Mesh[];
}

interface MoteVisual {
  group: THREE.Group;
  halo: THREE.Sprite;
}

type ScreenMode = 'menu' | 'intro' | 'playing' | 'paused' | 'result';

class DaoDenLongApp {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private skyUniforms!: {
    uTopColor: { value: THREE.Color };
    uBottomColor: { value: THREE.Color };
  };

  private worldGroup = new THREE.Group();
  private entityGroup = new THREE.Group();
  private sim: GameSimulation;
  private sound = new SoundEngine();

  private currentNight: NightId = 1;
  private campaignTotalScore = 0;
  private screenMode: ScreenMode = 'menu';
  private settingsReturnTo: ScreenMode = 'menu';
  private mouseSensitivity = 0.35;
  private colorblindMode = false;

  private playerGroup!: THREE.Group;
  private playerBodyGroup!: THREE.Group;
  private playerXrayGroup!: THREE.Group;
  private hatLanternPivot!: THREE.Group;
  private hatLanternLight!: THREE.PointLight;

  private occluderMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private rayOrigin = new THREE.Vector3();
  private rayTarget = new THREE.Vector3();
  private rayDir = new THREE.Vector3();
  private cutoutUniforms = {
    uCutoutCenter: { value: new THREE.Vector2(0, 0) },
    uCutoutRadius: { value: 0 },
    uPlayerViewZ: { value: 0 },
  };
  private drawingBufferSize = new THREE.Vector2();
  private tempViewPos = new THREE.Vector3();

  private warmGlowTex!: THREE.CanvasTexture;
  private paperLanternTex!: THREE.CanvasTexture;
  private tornLanternTex!: THREE.CanvasTexture;
  private grassTex!: THREE.CanvasTexture;

  private lanternVisuals = new Map<string, LanternVisual>();
  private moteVisuals = new Map<string, MoteVisual>();
  private shadeVisuals = new Map<string, ShadeVisual>();
  private drifterVisuals = new Map<string, DrifterVisual>();
  private charmVisuals = new Map<string, THREE.Group>();
  private clouds: THREE.Group[] = [];
  private windLeaves!: THREE.Points;
  private pulseWaves: Array<{ mesh: THREE.Mesh; age: number }> = [];

  private keys = new Set<string>();
  private pauseToggleQueued = false;
  private camYawDeg = 0;
  private isRightDragging = false;
  private lastMouseX = 0;
  private cameraShake = 0;
  private accumulator = 0;
  private lastTime = performance.now();
  private elapsedVisual = 0;
  private lastCountdownSec = 11;
  private wasWindWarning = false;

  // DOM elements
  private hud = document.getElementById('hud')!;
  private hudFlames = document.getElementById('hud-flames')!;
  private hudCharmBadge = document.getElementById('hud-charm-badge')!;
  private hudNightLabel = document.getElementById('hud-night-label')!;
  private hudTime = document.getElementById('hud-time')!;
  private hudWindBanner = document.getElementById('hud-wind-banner')!;
  private hudLanterns = document.getElementById('hud-lanterns')!;
  private hudScore = document.getElementById('hud-score')!;
  private hudCapacityLabel = document.getElementById('hud-capacity-label')!;
  private moteBar = document.getElementById('mote-bar')!;
  private moteSlots: HTMLDivElement[] = [];
  private currentBarCapacity = 0;
  private skillDashBox = document.getElementById('skill-dash')!;
  private hudDashCd = document.getElementById('hud-dash-cd')!;
  private skillPulseBox = document.getElementById('skill-pulse')!;
  private hudPulseCd = document.getElementById('hud-pulse-cd')!;
  private promptBanner = document.getElementById('prompt-banner')!;
  private lanternArrow = document.getElementById('lantern-arrow')!;

  private menuScreen = document.getElementById('menu-screen')!;
  private introScreen = document.getElementById('intro-screen')!;
  private introTitle = document.getElementById('intro-title')!;
  private introQuote = document.getElementById('intro-quote')!;
  private pauseScreen = document.getElementById('pause-screen')!;
  private settingsScreen = document.getElementById('settings-screen')!;
  private resultScreen = document.getElementById('result-screen')!;
  private resultTitle = document.getElementById('result-title')!;
  private resultDesc = document.getElementById('result-desc')!;
  private resultScore = document.getElementById('result-score')!;
  private btnResultNext = document.getElementById('btn-result-next') as HTMLButtonElement;

  private sliderVolume = document.getElementById('slider-volume') as HTMLInputElement;
  private valVolume = document.getElementById('val-volume')!;
  private sliderSens = document.getElementById('slider-sens') as HTMLInputElement;
  private valSens = document.getElementById('val-sens')!;
  private toggleColorblind = document.getElementById('toggle-colorblind') as HTMLInputElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.loadSettings();
    this.buildMoteBar();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0085);
    this.scene.add(this.worldGroup);
    this.scene.add(this.entityGroup);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 420);

    const sky = createSkyDome();
    this.skyUniforms = sky.uniforms;
    this.scene.add(sky.mesh);

    // Standard ambient light formula: intensity = 0.15 + 0.55 * (lit / total)
    this.ambientLight = new THREE.AmbientLight(0xdce6ff, 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x5a73a8, PALETTE.grass, 0.75);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xdde8ff, 1.5);
    this.moonLight.position.set(35, 55, -25);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.bias = -0.0005;
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 180;
    this.moonLight.shadow.camera.left = -65;
    this.moonLight.shadow.camera.right = 65;
    this.moonLight.shadow.camera.top = 65;
    this.moonLight.shadow.camera.bottom = -65;
    this.scene.add(this.moonLight);

    this.warmGlowTex = createGlowSpriteTexture();
    this.paperLanternTex = createPaperLanternTexture();
    this.tornLanternTex = createTornLanternTexture();
    this.grassTex = createPainterlyGrassTexture();

    this.buildSkyProps();
    this.buildPlayer();

    this.sim = new GameSimulation({ seed: 2026, night: 1 });
    this.rebuildWorldForNight(1);
    this.syncEntities(true);

    this.bindEvents();
    this.animate();
  }

  private loadSettings(): void {
    const savedSens = window.localStorage.getItem('ddl_sensitivity');
    if (savedSens !== null) {
      const s = Number.parseFloat(savedSens);
      if (Number.isFinite(s)) this.mouseSensitivity = Math.max(0.1, Math.min(1.0, s));
    }
    const savedCb = window.localStorage.getItem('ddl_colorblind');
    this.colorblindMode = savedCb === 'true';
    document.body.classList.toggle('colorblind', this.colorblindMode);
    this.toggleColorblind.checked = this.colorblindMode;

    this.sliderVolume.value = String(Math.round(this.sound.volume * 100));
    this.valVolume.textContent = `${this.sliderVolume.value}%`;
    this.sliderSens.value = String(Math.round(this.mouseSensitivity * 100));
    this.valSens.textContent = this.mouseSensitivity.toFixed(2);
  }

  private buildMoteBar(capacity = TUNING.carry_capacity): void {
    if (this.currentBarCapacity === capacity) return;
    this.currentBarCapacity = capacity;
    this.moteBar.innerHTML = '';
    this.moteSlots = [];
    for (let i = 0; i < capacity; i++) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      this.moteBar.appendChild(slot);
      this.moteSlots.push(slot);
    }
  }

  private buildSkyProps(): void {
    // Moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(8.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore }),
    );
    moon.position.set(60, 82, -105);
    this.scene.add(moon);

    // Sea of clouds (#12384A)
    const cloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      emissive: 0x0b2230,
      roughness: 0.95,
      transparent: true,
      opacity: 0.84,
    });
    for (let i = 0; i < 32; i++) {
      const cluster = new THREE.Group();
      const angle = (i / 32) * Math.PI * 2;
      const dist = 62 + (i % 4) * 16;
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + (p % 2) * 2.5, 2), cloudMat);
        puff.position.set((p - 1) * 5.2, (p % 2) * 1.4, (p - 1) * 2.0);
        puff.scale.y = 0.45;
        cluster.add(puff);
      }
      cluster.position.set(Math.cos(angle) * dist, -9.5 - (i % 3) * 2.0, Math.sin(angle) * dist);
      cluster.userData = { angle, dist, speed: 0.008 + (i % 4) * 0.002 };
      this.scene.add(cluster);
      this.clouds.push(cluster);
    }

    // Wind leaves particle system (visible during Night 3 wind warning / active wind)
    const leafCount = 180;
    const leafPos = new Float32Array(leafCount * 3);
    for (let i = 0; i < leafCount; i++) {
      leafPos[i * 3] = ((i * 37) % 90) - 45;
      leafPos[i * 3 + 1] = 0.8 + ((i * 19) % 10);
      leafPos[i * 3 + 2] = ((i * 53) % 90) - 45;
    }
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
    const leafMat = new THREE.PointsMaterial({
      color: PALETTE.gold,
      size: 0.55,
      transparent: true,
      opacity: 0,
    });
    this.windLeaves = new THREE.Points(leafGeo, leafMat);
    this.scene.add(this.windLeaves);
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  private applyScopeCutout(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCutoutCenter = this.cutoutUniforms.uCutoutCenter;
      shader.uniforms.uCutoutRadius = this.cutoutUniforms.uCutoutRadius;
      shader.uniforms.uPlayerViewZ = this.cutoutUniforms.uPlayerViewZ;

      shader.fragmentShader =
        `
        uniform vec2 uCutoutCenter;
        uniform float uCutoutRadius;
        uniform float uPlayerViewZ;
        float bayer4x4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int idx = y * 4 + x;
          if (idx == 0) return 0.0 / 16.0;
          if (idx == 1) return 8.0 / 16.0;
          if (idx == 2) return 2.0 / 16.0;
          if (idx == 3) return 10.0 / 16.0;
          if (idx == 4) return 12.0 / 16.0;
          if (idx == 5) return 4.0 / 16.0;
          if (idx == 6) return 14.0 / 16.0;
          if (idx == 7) return 6.0 / 16.0;
          if (idx == 8) return 3.0 / 16.0;
          if (idx == 9) return 11.0 / 16.0;
          if (idx == 10) return 1.0 / 16.0;
          if (idx == 11) return 9.0 / 16.0;
          if (idx == 12) return 15.0 / 16.0;
          if (idx == 13) return 7.0 / 16.0;
          if (idx == 14) return 13.0 / 16.0;
          return 5.0 / 16.0;
        }
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uCutoutRadius > 1.0 && vViewPosition.z < uPlayerViewZ - 0.45) {
          float dPx = distance(gl_FragCoord.xy, uCutoutCenter);
          if (dPx < uCutoutRadius) {
            float t = smoothstep(uCutoutRadius * 0.55, uCutoutRadius, dPx);
            if (t < bayer4x4(gl_FragCoord.xy)) {
              discard;
            }
          }
        }`,
      );
    };
    mat.customProgramCacheKey = () => 'scope-cutout-v1';
    return mat;
  }

  private addIslandCylinder(
    cx: number,
    cz: number,
    radius: number,
    topY = 0,
    height = 2.0,
    occludable = false,
  ): void {
    const grassMat = new THREE.MeshStandardMaterial({
      map: this.grassTex,
      roughness: 0.9,
    });
    if (occludable) this.applyScopeCutout(grassMat);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.96, height, 64),
      grassMat,
    );
    disc.position.set(cx, topY - height / 2, cz);
    disc.receiveShadow = true;
    this.worldGroup.add(disc);
    if (occludable) {
      this.occluderMeshes.push(disc);
    }

    if (topY === 0) {
      const cliff = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.94, 14, 24),
        new THREE.MeshStandardMaterial({ color: 0x36434e, roughness: 0.95, flatShading: true }),
      );
      cliff.rotation.x = Math.PI;
      cliff.position.set(cx, -8.8, cz);
      this.worldGroup.add(cliff);
    }
  }

  private addGhibliTree(x: number, y: number, z: number): void {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.38, 2.3, 8),
      this.applyScopeCutout(
        new THREE.MeshStandardMaterial({
          color: PALETTE.wood,
          roughness: 0.9,
        }),
      ),
    );
    trunk.position.y = 1.15;
    trunk.castShadow = true;
    tree.add(trunk);
    this.occluderMeshes.push(trunk);

    const canopyMat = this.applyScopeCutout(
      new THREE.MeshStandardMaterial({
        color: PALETTE.grass,
        roughness: 0.85,
      }),
    );
    for (const [px, py, pz, pr] of [
      [0, 3.0, 0, 1.7],
      [-0.9, 2.5, 0.4, 1.2],
      [0.95, 2.6, -0.3, 1.25],
    ]) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 2), canopyMat);
      puff.position.set(px, py, pz);
      puff.scale.y = 0.82;
      puff.castShadow = true;
      tree.add(puff);
      this.occluderMeshes.push(puff);
    }
    tree.position.set(x, y, z);
    this.worldGroup.add(tree);
  }

  private addJumpPadVisual(x: number, y: number, z: number, radius: number): void {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.1, 0.16, 20),
      new THREE.MeshStandardMaterial({
        color: PALETTE.gold,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 0.8,
        roughness: 0.35,
      }),
    );
    pad.position.set(x, y + 0.08, z);
    this.worldGroup.add(pad);
  }

  private rebuildWorldForNight(night: NightId): void {
    this.clearGroup(this.worldGroup);
    this.clearGroup(this.entityGroup);
    this.occluderMeshes = [];
    this.lanternVisuals.clear();
    this.moteVisuals.clear();
    this.shadeVisuals.clear();
    this.drifterVisuals.clear();
    this.charmVisuals.clear();

    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.88 });

    if (night === 1) {
      this.addIslandCylinder(0, 0, 40, 0, 2.0);
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.1, 32), sandMat);
      plaza.position.y = 0.03;
      plaza.receiveShadow = true;
      this.worldGroup.add(plaza);

      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.2;
        this.addGhibliTree(Math.cos(a) * 35.5, 0, Math.sin(a) * 35.5);
      }
    } else if (night === 2) {
      this.addIslandCylinder(0, 0, 28, 0, 2.0);
      this.addIslandCylinder(70, 0, 28, 0, 2.0);

      // Bamboo bridge x in [26, 44], z in [-2, 2]
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4), woodMat);
      bridge.position.set(35, -0.15, 0);
      bridge.receiveShadow = true;
      bridge.castShadow = true;
      this.worldGroup.add(bridge);

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        this.addGhibliTree(Math.cos(a) * 24, 0, Math.sin(a) * 24);
        this.addGhibliTree(70 + Math.cos(a) * 24, 0, Math.sin(a) * 24);
      }
    } else {
      // Night 3 — Đảo Chuông (3 tiers)
      this.addIslandCylinder(0, 0, 45, 0, 2.0);

      // Tier 1: annulus r 12..24 in z > 0 at Y = 3
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.lineTo(-12, 0);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      shape.closePath();
      const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: false });
      extrudeGeo.rotateX(Math.PI / 2); // maps shape +Y -> world +Z, extrude depth -> -Y
      const tier1 = new THREE.Mesh(
        extrudeGeo,
        this.applyScopeCutout(
          new THREE.MeshStandardMaterial({
            map: this.grassTex,
            roughness: 0.9,
          }),
        ),
      );
      tier1.position.y = 3.0;
      tier1.receiveShadow = true;
      tier1.castShadow = true;
      this.worldGroup.add(tier1);
      this.occluderMeshes.push(tier1);

      // Tier 2: disc r = 8 at Y = 6 (occludable when player is behind/below)
      this.addIslandCylinder(0, 0, 8, 6, 6.0, true);

      // Two straight ramps at 30° and 150° from r=30 (Y=0) to r=24 (Y=3), width 3m
      for (const ramp of NIGHT_MAPS[3].ramps) {
        const rad = (ramp.angleDeg * Math.PI) / 180;
        const midR = (ramp.rOuter + ramp.rInner) / 2;
        const len = Math.hypot(ramp.rOuter - ramp.rInner, ramp.yInner - ramp.yOuter);
        const slopeAngle = Math.atan2(ramp.yInner - ramp.yOuter, ramp.rOuter - ramp.rInner);
        const rampGroup = new THREE.Group();
        rampGroup.position.set(Math.cos(rad) * midR, (ramp.yOuter + ramp.yInner) / 2, Math.sin(rad) * midR);
        rampGroup.rotation.y = -rad;
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(len, 0.25, ramp.halfWidth * 2),
          this.applyScopeCutout(
            new THREE.MeshStandardMaterial({
              color: PALETTE.wood,
              roughness: 0.88,
            }),
          ),
        );
        plank.rotation.z = -slopeAngle;
        plank.receiveShadow = true;
        plank.castShadow = true;
        rampGroup.add(plank);
        this.worldGroup.add(rampGroup);
        this.occluderMeshes.push(plank);
      }

      // Bell Tower at center of Tier 2 (R = 2m, H = 8m, Y = 6..14)
      const towerMat = this.applyScopeCutout(
        new THREE.MeshStandardMaterial({
          color: PALETTE.wood,
          roughness: 0.88,
        }),
      );
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(BELL_TOWER_RADIUS, BELL_TOWER_RADIUS, 8, 16),
        towerMat,
      );
      tower.position.set(0, 10, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.2, 8), towerMat);
      towerRoof.position.set(0, 15.1, 0);
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.95, 1.3, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.5, roughness: 0.3 }),
      );
      bell.position.set(0, 13.0, 0);
      this.worldGroup.add(tower, towerRoof, bell);
      this.occluderMeshes.push(tower, towerRoof);

      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.15;
        this.addGhibliTree(Math.cos(a) * 40.5, 0, Math.sin(a) * 40.5);
      }
    }

    // Jump pads
    for (const pad of NIGHT_MAPS[night].jumpPads) {
      this.addJumpPadVisual(pad.x, pad.y, pad.z, pad.radius);
    }
  }

  private buildPlayer(): void {
    // Mây: cloak #E8E2D0, red scarf #C8102E, bamboo nón lá + hanging lantern
    this.playerGroup = new THREE.Group();
    this.playerBodyGroup = new THREE.Group();
    this.playerGroup.add(this.playerBodyGroup);

    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.05, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.7 }),
    );
    cloak.position.y = 0.56;
    cloak.castShadow = true;
    this.playerBodyGroup.add(cloak);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.08, 10, 18),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.65 }),
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.05;
    this.playerBodyGroup.add(scarf);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffe3c4, roughness: 0.55 }),
    );
    head.position.y = 1.28;
    head.castShadow = true;
    this.playerBodyGroup.add(head);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.74, 0.38, 24, 1, true),
      new THREE.MeshStandardMaterial({
        map: createBambooHatTexture(),
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    hat.position.y = 1.62;
    hat.castShadow = true;
    this.playerBodyGroup.add(hat);

    this.hatLanternPivot = new THREE.Group();
    this.hatLanternPivot.position.set(0, 1.44, 0.66);
    this.playerBodyGroup.add(this.hatLanternPivot);

    const smallLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({
        map: this.paperLanternTex,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 1.8,
      }),
    );
    smallLantern.position.y = -0.24;
    this.hatLanternPivot.add(smallLantern);

    this.hatLanternLight = new THREE.PointLight(PALETTE.lanternLit, 5.5, 13, 1.5);
    this.hatLanternLight.position.set(0, -0.24, 0);
    this.hatLanternPivot.add(this.hatLanternLight);

    // X-ray silhouette shown only when Mây is occluded by another tier / tower / tree
    this.playerXrayGroup = new THREE.Group();
    const xrayMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternCore,
      transparent: true,
      opacity: 0.42,
      depthTest: false,
      depthWrite: false,
    });
    const xCloak = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.05, 12), xrayMat);
    xCloak.position.y = 0.56;
    xCloak.renderOrder = 50;
    const xHead = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 10), xrayMat);
    xHead.position.y = 1.28;
    xHead.renderOrder = 50;
    const xHat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.39, 16, 1, true), xrayMat);
    xHat.position.y = 1.62;
    xHat.renderOrder = 50;
    this.playerXrayGroup.add(xCloak, xHead, xHat);
    this.playerXrayGroup.visible = false;
    this.playerBodyGroup.add(this.playerXrayGroup);

    this.scene.add(this.playerGroup);
  }

  private createLanternVisual(id: string): LanternVisual {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.95, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.9 }),
    );
    base.position.y = 0.22;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 3.1, 10), woodMat);
    pole.position.y = 1.8;
    pole.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.55, 6), woodMat);
    roof.position.y = 4.15;

    const bulbMat = new THREE.MeshStandardMaterial({
      map: this.paperLanternTex,
      color: PALETTE.lanternUnlit,
      emissive: 0x222030,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), bulbMat);
    bulb.scale.y = 1.25;
    bulb.position.y = 3.35;
    group.add(base, pole, roof, bulb);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 26, 1.35);
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

    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.16, TUNING.safe_radius, 56),
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      }),
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.06;
    group.add(safeRing);

    // Overhead fuel bar for lit lanterns
    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.set(0, 5.15, 0);
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide }),
    );
    const fuelBarMat = new THREE.MeshBasicMaterial({
      color: PALETTE.gold,
      side: THREE.DoubleSide,
    });
    const fuelBarFill = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.16), fuelBarMat);
    fuelBarFill.position.z = 0.02;
    fuelBarGroup.add(barBg, fuelBarFill);
    fuelBarGroup.visible = false;
    group.add(fuelBarGroup);

    this.entityGroup.add(group);
    const vis: LanternVisual = {
      group,
      bulb,
      bulbMat,
      light,
      halo,
      safeRing,
      fuelBarGroup,
      fuelBarFill,
      fuelBarMat,
    };
    this.lanternVisuals.set(id, vis);
    return vis;
  }

  private createMoteVisual(id: string): MoteVisual {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.set(1.6, 1.6, 1);
    group.add(core, halo);
    this.entityGroup.add(group);
    const vis: MoteVisual = { group, halo };
    this.moteVisuals.set(id, vis);
    return vis;
  }

  private createShadeVisual(id: string): ShadeVisual {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.shadeBody,
      emissive: PALETTE.shadeRim,
      emissiveIntensity: 0.65,
      roughness: 0.55,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 14), bodyMat);
    core.position.y = 1.1;
    core.scale.set(1, 1.25, 1);
    group.add(core);

    const wisps: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.3 - i * 0.05, 8, 8), bodyMat);
      w.position.set(0, 0.65 - i * 0.14, -0.25 - i * 0.16);
      group.add(w);
      wisps.push(w);
    }

    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), eyeMat);
    eyeL.position.set(-0.2, 1.22, 0.52);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.2;
    group.add(eyeL, eyeR);

    this.entityGroup.add(group);
    const vis: ShadeVisual = { group, bodyMat, wisps, eyeMat };
    this.shadeVisuals.set(id, vis);
    return vis;
  }

  private createDrifterVisual(id: string): DrifterVisual {
    // Gió Lạc: flowing grey-blue silk ribbon (#8FA3B8)
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.drifter,
      emissive: 0x3b4d63,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
    const ribbonSegments: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.45 - i * 0.05, 0.12, 0.55), mat);
      seg.position.set(0, 1.4, -i * 0.45);
      group.add(seg);
      ribbonSegments.push(seg);
    }
    this.entityGroup.add(group);
    const vis: DrifterVisual = { group, ribbonSegments };
    this.drifterVisuals.set(id, vis);
    return vis;
  }

  private createCharmVisual(id: string): THREE.Group {
    // Bùa Gió: red talisman (#C8102E) with gold trim (#F2C14E)
    const group = new THREE.Group();
    const talisman = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.85, 0.08),
      new THREE.MeshStandardMaterial({
        color: PALETTE.mayScarf,
        emissive: 0x7a0818,
        emissiveIntensity: 0.7,
      }),
    );
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.95, 0.05),
      new THREE.MeshStandardMaterial({
        color: PALETTE.gold,
        emissive: PALETTE.gold,
        emissiveIntensity: 0.8,
      }),
    );
    group.add(frame, talisman);
    this.entityGroup.add(group);
    this.charmVisuals.set(id, group);
    return group;
  }

  private spawnPulseWave(): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.85, 56),
      new THREE.MeshBasicMaterial({
        color: PALETTE.moteHalo,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.sim.player.x, this.sim.player.y + 0.25, this.sim.player.z);
    this.scene.add(mesh);
    this.pulseWaves.push({ mesh, age: 0 });
  }

  private setScreen(mode: ScreenMode): void {
    this.screenMode = mode;
    this.menuScreen.classList.toggle('visible', mode === 'menu');
    this.introScreen.classList.toggle('visible', mode === 'intro');
    this.pauseScreen.classList.toggle('visible', mode === 'paused');
    this.resultScreen.classList.toggle('visible', mode === 'result');
    this.hud.classList.toggle('visible', mode === 'playing' || mode === 'paused');
    if (mode !== 'playing') {
      this.lanternArrow.style.display = 'none';
    }
  }

  private openNightIntro(night: NightId, resetCampaign = false): void {
    if (resetCampaign) this.campaignTotalScore = 0;
    this.currentNight = night;
    const def = NIGHT_MAPS[night];
    this.introTitle.textContent = def.name;
    this.introQuote.textContent = def.introQuote;
    this.setScreen('intro');
  }

  private startNight(night: NightId): void {
    this.currentNight = night;
    this.sim = new GameSimulation({ seed: (2026 + night * 137) >>> 0, night });
    this.rebuildWorldForNight(night);
    this.lastCountdownSec = 11;
    this.wasWindWarning = false;
    this.camYawDeg = 0;
    this.sound.startBgm();
    this.syncEntities(true);
    this.setScreen('playing');
  }

  private handleEvents(events: EventRecord[]): void {
    for (const ev of events) {
      switch (ev.name) {
        case 'mote_picked':
          this.sound.playMotePickup();
          break;
        case 'charm_picked':
          this.sound.playCharmPickup();
          break;
        case 'deposit':
          this.sound.playDeposit();
          break;
        case 'lantern_lit':
          this.sound.playLanternLit();
          break;
        case 'dash':
          this.sound.playDash();
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
        case 'shade_spawned':
          this.sound.playShadeSpawn();
          break;
        case 'paused':
          this.setScreen('paused');
          break;
        case 'resumed':
          this.setScreen('playing');
          break;
        case 'game_over': {
          const res = ev.data.result as string;
          const reason = ev.data.reason as string;
          if (res === 'won') {
            this.sound.playWin();
            this.campaignTotalScore += this.sim.score;
            if (this.currentNight < 3) {
              this.resultTitle.textContent = `Thắng ${NIGHT_MAPS[this.currentNight].name}!`;
              this.resultDesc.textContent = `Điểm Đêm ${this.currentNight}: ${this.sim.score} · Tổng điểm hành trình: ${this.campaignTotalScore}`;
              this.resultScore.textContent = `Tổng điểm: ${this.campaignTotalScore}`;
              this.btnResultNext.style.display = 'inline-block';
            } else {
              this.resultTitle.textContent = 'Bình Minh Trên Ba Hòn Đảo!';
              this.resultDesc.textContent =
                'Mây đã thắp sáng toàn bộ Đảo Bến, Đảo Cau và Đảo Chuông. Ánh bình minh rực rỡ đã trở lại!';
              this.resultScore.textContent = `Tổng điểm cả 3 Đêm: ${this.campaignTotalScore}`;
              this.btnResultNext.style.display = 'none';
            }
          } else {
            this.sound.playLose();
            this.resultTitle.textContent =
              reason === 'dawn' ? 'Hết Thời Gian' : 'Ngọn Lửa Đã Tắt';
            this.resultDesc.textContent =
              reason === 'dawn'
                ? 'Bình minh tới trước khi toàn bộ Đèn Lồng kịp sáng.'
                : 'Mây đã mất hết Ngọn Lửa. Bạn có thể chơi lại Đêm này ngay!';
            this.resultScore.textContent = `Điểm Đêm: ${this.sim.score}`;
            this.btnResultNext.style.display = 'none';
          }
          this.setScreen('result');
          break;
        }
      }
    }
  }

  private syncEntities(initial = false): void {
    // Player
    this.playerGroup.visible = this.sim.player.respawnWaitTicks === 0;
    this.playerGroup.position.set(this.sim.player.x, this.sim.player.y, this.sim.player.z);
    this.playerGroup.rotation.y = this.sim.player.facingYaw;
    const speedXZ = Math.hypot(this.sim.player.vx, this.sim.player.vz);
    const bob =
      speedXZ > 0.5 && this.sim.player.grounded
        ? Math.abs(Math.sin(this.elapsedVisual * 11)) * 0.08
        : 0;
    this.playerBodyGroup.position.y = bob;
    this.hatLanternPivot.rotation.z = Math.sin(this.elapsedVisual * 4.5) * (speedXZ > 0.5 ? 0.16 : 0.05);

    // Lanterns
    let litCount = 0;
    let nearestInteractPrompt: string | null = null;
    let nearestOffscreenLantern: THREE.Vector3 | null = null;
    let nearestUnlitDist = Infinity;
    const blink1Hz = Math.sin(this.elapsedVisual * Math.PI * 2) > 0;

    for (const lantern of this.sim.lanterns) {
      let vis = this.lanternVisuals.get(lantern.id);
      if (!vis) vis = this.createLanternVisual(lantern.id);
      vis.group.position.set(lantern.x, lantern.y, lantern.z);

      const d = distXZ(this.sim.player.x, this.sim.player.z, lantern.x, lantern.z);
      const inInteractRange = d <= TUNING.interact_radius && Math.abs(this.sim.player.y - lantern.y) <= 2.5;

      if (lantern.lit) {
        litCount++;
        const fuelRatio = Math.max(0, Math.min(1, lantern.fuel60 / FUEL_MAX_60));
        const isLowFuel = lantern.fuel60 < LOW_FUEL_THRESHOLD_60;
        const flickerMult = isLowFuel && !blink1Hz ? 0.35 : 1.0;

        vis.bulb.scale.set(1, 1.25, 1);
        if (vis.bulbMat.map !== this.paperLanternTex) {
          vis.bulbMat.map = this.paperLanternTex;
          vis.bulbMat.needsUpdate = true;
        }
        vis.bulbMat.color.setHex(PALETTE.lanternCore);
        vis.bulbMat.emissive.setHex(PALETTE.lanternLit);
        vis.bulbMat.emissiveIntensity = 1.9 * flickerMult;
        vis.light.intensity = 22 * flickerMult;
        (vis.halo.material as THREE.SpriteMaterial).opacity = 0.72 * flickerMult;
        // Safe zone only active when fuel >= 30
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = isLowFuel ? 0 : 0.28;

        // Fuel bar faces camera
        vis.fuelBarGroup.visible = true;
        vis.fuelBarGroup.lookAt(this.camera.position);
        vis.fuelBarFill.scale.x = Math.max(0.01, fuelRatio);
        vis.fuelBarFill.position.x = -(1 - fuelRatio);
        vis.fuelBarMat.color.setHex(
          isLowFuel
            ? blink1Hz
              ? this.colorblindMode
                ? 0xffffff
                : 0xff5a5f
              : 0x444455
            : PALETTE.gold,
        );

        if (inInteractRange && lantern.fuel60 < FUEL_MAX_60) {
          nearestInteractPrompt = `E — Châm dầu (${Math.round(lantern.fuel60 / TICK_RATE)}%)`;
        }
      } else {
        const cost = lantern.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
        const frac = lantern.deposited / cost;
        // Unlit lantern is squashed 20% vertically + torn paper texture (no-color distinction)
        vis.bulb.scale.set(1, 1.25 * 0.8, 1);
        if (vis.bulbMat.map !== this.tornLanternTex) {
          vis.bulbMat.map = this.tornLanternTex;
          vis.bulbMat.needsUpdate = true;
        }
        vis.bulbMat.color.setHex(PALETTE.lanternUnlit);
        vis.bulbMat.emissive.setHex(PALETTE.lanternLit);
        vis.bulbMat.emissiveIntensity = frac * 0.8;
        vis.light.intensity = frac * 5;
        (vis.halo.material as THREE.SpriteMaterial).opacity = frac * 0.3;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0;
        vis.fuelBarGroup.visible = false;

        if (inInteractRange) {
          nearestInteractPrompt = lantern.everLit
            ? `E — Thắp lại (${lantern.deposited}/${cost})`
            : `E — Nạp ánh sáng (${lantern.deposited}/${cost})`;
        }
        if (d < nearestUnlitDist) {
          nearestUnlitDist = d;
          nearestOffscreenLantern = new THREE.Vector3(lantern.x, lantern.y + 3.4, lantern.z);
        }
      }
    }

    // Standard ambient light progress formula: 0.15 + 0.55 * (lit / total)
    const progress = litCount / Math.max(1, this.sim.lanterns.length);
    this.ambientLight.intensity = 0.15 + 0.55 * progress;
    this.skyUniforms.uTopColor.value.setHex(PALETTE.sky);
    this.skyUniforms.uBottomColor.value.setHex(PALETTE.fog);

    // Motes
    const activeMoteIds = new Set(this.sim.motes.map((m) => m.id));
    for (const [id, vis] of this.moteVisuals.entries()) {
      if (!activeMoteIds.has(id)) {
        this.entityGroup.remove(vis.group);
        this.moteVisuals.delete(id);
      }
    }
    for (const mote of this.sim.motes) {
      let vis = this.moteVisuals.get(mote.id);
      if (!vis) vis = this.createMoteVisual(mote.id);
      const hoverY = mote.y + 0.85 + Math.sin(this.elapsedVisual * 3 + mote.x) * 0.2;
      vis.group.position.set(mote.x, hoverY, mote.z);
    }

    // Shades
    const activeShadeIds = new Set(this.sim.shades.map((s) => s.id));
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.entityGroup.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }
    for (const shade of this.sim.shades) {
      let vis = this.shadeVisuals.get(shade.id);
      if (!vis) vis = this.createShadeVisual(shade.id);
      vis.group.position.set(shade.x, shade.y + Math.sin(this.elapsedVisual * 4 + shade.x) * 0.12, shade.z);
      vis.group.lookAt(this.sim.player.x, shade.y + 1.0, this.sim.player.z);

      const rimHex = this.colorblindMode ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
      if (shade.state === 'stunned') {
        vis.bodyMat.color.setHex(PALETTE.shadeStunned);
        vis.bodyMat.emissive.setHex(PALETTE.gold);
        vis.bodyMat.emissiveIntensity = 1.1;
        vis.eyeMat.color.setHex(PALETTE.gold);
      } else {
        vis.bodyMat.color.setHex(PALETTE.shadeBody);
        vis.bodyMat.emissive.setHex(rimHex);
        vis.bodyMat.emissiveIntensity =
          shade.state === 'drain' ? 1.35 : shade.state === 'spawning' ? 0.3 : 0.7;
        vis.eyeMat.color.setHex(rimHex);
      }
    }

    // Drifters
    const activeDrifterIds = new Set(
      this.sim.drifters.filter((d) => d.state !== 'removed').map((d) => d.id),
    );
    for (const [id, vis] of this.drifterVisuals.entries()) {
      if (!activeDrifterIds.has(id)) {
        this.entityGroup.remove(vis.group);
        this.drifterVisuals.delete(id);
      }
    }
    for (const drifter of this.sim.drifters) {
      if (drifter.state === 'removed') continue;
      let vis = this.drifterVisuals.get(drifter.id);
      if (!vis) vis = this.createDrifterVisual(drifter.id);
      vis.group.position.set(drifter.x, drifter.y + Math.sin(this.elapsedVisual * 5) * 0.25, drifter.z);
      vis.group.lookAt(this.sim.player.x, drifter.y + 1.4, this.sim.player.z);
      vis.ribbonSegments.forEach((seg, idx) => {
        seg.position.x = Math.sin(this.elapsedVisual * 7 + idx * 0.9) * 0.22;
      });
    }

    // Charms
    for (const charm of this.sim.charms) {
      let vis = this.charmVisuals.get(charm.id);
      if (!vis) vis = this.createCharmVisual(charm.id);
      vis.visible = charm.available;
      vis.position.set(charm.x, charm.y + 1.1 + Math.sin(this.elapsedVisual * 3) * 0.18, charm.z);
      vis.rotation.y = this.elapsedVisual * 1.6;
    }

    // Wind leaves visual & warning audio
    const leafMat = this.windLeaves.material as THREE.PointsMaterial;
    if (this.sim.wind.active || this.sim.wind.warning) {
      leafMat.opacity = this.sim.wind.active ? 0.85 : 0.45;
      const rad = (this.sim.wind.dir_deg * Math.PI) / 180;
      const posAttr = this.windLeaves.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let lx = posAttr.getX(i) + Math.cos(rad) * 0.35;
        let lz = posAttr.getZ(i) + Math.sin(rad) * 0.35;
        if (lx > 45) lx -= 90;
        if (lx < -45) lx += 90;
        if (lz > 45) lz -= 90;
        if (lz < -45) lz += 90;
        posAttr.setX(i, lx);
        posAttr.setZ(i, lz);
      }
      posAttr.needsUpdate = true;
      if (this.sim.wind.warning && !this.wasWindWarning) {
        this.sound.playWindWarning();
      }
    } else {
      leafMat.opacity = 0;
    }
    this.wasWindWarning = this.sim.wind.warning;

    // HUD Updates
    this.hudFlames.textContent =
      this.sim.player.flames > 0 ? '🔥'.repeat(this.sim.player.flames) : '—';
    if (this.sim.player.charmTicks > 0) {
      this.hudCharmBadge.style.display = 'inline-block';
      this.hudCharmBadge.textContent = `Bùa Gió: ${(this.sim.player.charmTicks / 60).toFixed(1)}s`;
    } else {
      this.hudCharmBadge.style.display = 'none';
    }

    this.hudNightLabel.textContent = NIGHT_MAPS[this.currentNight].name;
    const totalSec = Math.ceil(this.sim.timeLeftS);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    const warnPrefix = this.colorblindMode && totalSec <= 30 ? '⚠ ' : '';
    this.hudTime.textContent = `${warnPrefix}${mm}:${ss}`;
    this.hudTime.classList.toggle('danger', totalSec <= 30);

    // 10-second final countdown beep
    if (this.sim.state === 'playing' && totalSec <= 10 && totalSec > 0 && totalSec < this.lastCountdownSec) {
      this.lastCountdownSec = totalSec;
      this.sound.playCountdownTick();
    }

    if (this.sim.wind.active) {
      this.hudWindBanner.style.display = 'block';
      this.hudWindBanner.textContent = this.colorblindMode
        ? '⚠ Gió mạnh đang thổi!'
        : 'Gió mạnh đang thổi!';
    } else if (this.sim.wind.warning) {
      this.hudWindBanner.style.display = 'block';
      this.hudWindBanner.textContent = this.colorblindMode
        ? '⚠ Cảnh báo: Gió mạnh sắp thổi!'
        : 'Cảnh báo: Gió mạnh sắp thổi!';
    } else {
      this.hudWindBanner.style.display = 'none';
    }

    const reqLit = Math.ceil(TUNING.win_ratio * this.sim.lanterns.length);
    this.hudLanterns.textContent = `${litCount} / ${this.sim.lanterns.length} (cần ${reqLit})`;
    this.hudScore.textContent = String(this.sim.score);

    // Dynamic capacity mote bar (10..20)
    const cap = this.sim.getPlayerCapacity();
    this.hudCapacityLabel.textContent = `Đom đóm: ${this.sim.player.carried} / ${cap}`;
    this.buildMoteBar(cap);
    this.moteSlots.forEach((slot, idx) => {
      slot.classList.toggle('filled', idx < this.sim.player.carried);
    });

    // Cooldown boxes
    const dashCooling = this.sim.player.dashCdTicks > 0 && this.sim.player.charmTicks <= 0;
    this.skillDashBox.classList.toggle('cooling', dashCooling);
    this.hudDashCd.textContent =
      this.sim.player.charmTicks > 0
        ? 'Miễn hồi'
        : dashCooling
          ? `${(this.sim.player.dashCdTicks / 60).toFixed(1)}s`
          : 'Sẵn sàng';

    const pulseCooling =
      this.sim.player.pulseCdTicks > 0 || this.sim.player.carried < TUNING.pulse_cost;
    this.skillPulseBox.classList.toggle('cooling', pulseCooling);
    this.hudPulseCd.textContent =
      this.sim.player.pulseCdTicks > 0
        ? `${(this.sim.player.pulseCdTicks / 60).toFixed(1)}s`
        : this.sim.player.carried < TUNING.pulse_cost
          ? `Cần ${TUNING.pulse_cost}`
          : 'Sẵn sàng';

    // Interact prompt
    if (!initial && this.sim.state === 'playing' && nearestInteractPrompt) {
      this.promptBanner.style.display = 'block';
      this.promptBanner.textContent = nearestInteractPrompt;
    } else {
      this.promptBanner.style.display = 'none';
    }

    // Off-screen indicator arrow toward nearest unlit lantern
    this.updateOffscreenArrow(nearestOffscreenLantern);
  }

  private updateOffscreenArrow(targetWorld: THREE.Vector3 | null): void {
    if (!targetWorld || this.screenMode !== 'playing') {
      this.lanternArrow.style.display = 'none';
      return;
    }
    const proj = targetWorld.clone().project(this.camera);
    const inFront = proj.z < 1;
    const onScreen = inFront && Math.abs(proj.x) <= 0.92 && Math.abs(proj.y) <= 0.92;
    if (onScreen) {
      this.lanternArrow.style.display = 'none';
      return;
    }

    let nx = proj.x;
    let ny = proj.y;
    if (!inFront) {
      nx = -nx;
      ny = -ny;
    }
    const angle = Math.atan2(ny, nx);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 48;
    const cx = w / 2 + Math.cos(angle) * (w / 2 - pad);
    const cy = h / 2 - Math.sin(angle) * (h / 2 - pad);

    this.lanternArrow.style.display = 'flex';
    this.lanternArrow.style.left = `${Math.max(pad, Math.min(w - pad, cx))}px`;
    this.lanternArrow.style.top = `${Math.max(pad, Math.min(h - pad, cy))}px`;
    const deg = (-angle * 180) / Math.PI + 90;
    this.lanternArrow.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
  }

  private pollInput(): InputState {
    const input = createDefaultInputState();
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;

    if (this.keys.has('KeyZ') || this.keys.has('BracketLeft')) this.camYawDeg += 1.8;
    if (this.keys.has('KeyC') || this.keys.has('BracketRight')) this.camYawDeg -= 1.8;

    input.move = [mx, mz];
    input.cam_yaw_deg = this.camYawDeg;
    input.jump = this.keys.has('Space');
    input.interact = this.keys.has('KeyE') || this.keys.has('KeyF') || this.keys.has('Enter');
    input.dash = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    input.pulse = this.keys.has('KeyQ') || this.keys.has('KeyK');
    input.pause = this.pauseToggleQueued;
    this.pauseToggleQueued = false;
    return input;
  }

  private updateCamera(frameDt: number): void {
    const theta = (this.camYawDeg * Math.PI) / 180;
    const forwardX = Math.sin(theta);
    const forwardZ = Math.cos(theta);
    const dist = 12.5;
    const height = 7.0;

    const targetPos = new THREE.Vector3(
      this.sim.player.x - forwardX * dist,
      Math.max(2, this.sim.player.y + height),
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

    this.camera.lookAt(this.sim.player.x, Math.max(0, this.sim.player.y + 1.5), this.sim.player.z);
  }

  private updateOcclusion(frameDt: number): void {
    const blend = 1 - Math.exp(-14 * frameDt);
    if (this.occluderMeshes.length === 0 || this.sim.player.respawnWaitTicks > 0) {
      this.cutoutUniforms.uCutoutRadius.value *= 1 - blend;
      this.playerXrayGroup.visible = false;
      return;
    }

    this.rayOrigin.copy(this.camera.position);
    this.rayTarget.set(this.sim.player.x, this.sim.player.y + 1.05, this.sim.player.z);
    this.rayDir.subVectors(this.rayTarget, this.rayOrigin);
    const dist = this.rayDir.length();
    if (dist < 0.5) {
      this.cutoutUniforms.uCutoutRadius.value *= 1 - blend;
      this.playerXrayGroup.visible = false;
      return;
    }
    this.rayDir.divideScalar(dist);

    this.raycaster.set(this.rayOrigin, this.rayDir);
    this.raycaster.near = 0.2;
    this.raycaster.far = Math.max(0.25, dist - 0.55);

    const hits = this.raycaster.intersectObjects(this.occluderMeshes, false);
    const isOccluded = hits.length > 0;

    // Project Mây's torso to framebuffer pixel coordinates for a tight circular peephole scope
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    const proj = this.rayTarget.clone().project(this.camera);
    this.cutoutUniforms.uCutoutCenter.value.set(
      (proj.x * 0.5 + 0.5) * this.drawingBufferSize.x,
      (proj.y * 0.5 + 0.5) * this.drawingBufferSize.y,
    );

    this.tempViewPos.copy(this.rayTarget).applyMatrix4(this.camera.matrixWorldInverse);
    this.cutoutUniforms.uPlayerViewZ.value = -this.tempViewPos.z;

    // Compact scope radius (15% of screen height) — opens a clean window around Mây
    const targetRadius = isOccluded ? this.drawingBufferSize.y * 0.15 : 0;
    this.cutoutUniforms.uCutoutRadius.value +=
      (targetRadius - this.cutoutUniforms.uCutoutRadius.value) * blend;

    this.playerXrayGroup.visible = false;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.keys.has('Space') && this.screenMode === 'playing' && this.sim.player.grounded) {
        this.sound.playJump();
      }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
        if (this.screenMode === 'playing' || this.screenMode === 'paused') {
          this.pauseToggleQueued = true;
        }
      }
      this.keys.add(e.code);
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
      if (this.isRightDragging && this.screenMode === 'playing') {
        const dx = e.clientX - this.lastMouseX;
        this.lastMouseX = e.clientX;
        this.camYawDeg -= dx * this.mouseSensitivity;
      }
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Menu & Screen Buttons
    document.getElementById('btn-start-campaign')!.addEventListener('click', () => {
      this.openNightIntro(1, true);
    });
    document.getElementById('btn-night-1')!.addEventListener('click', () => this.openNightIntro(1, true));
    document.getElementById('btn-night-2')!.addEventListener('click', () => this.openNightIntro(2, true));
    document.getElementById('btn-night-3')!.addEventListener('click', () => this.openNightIntro(3, true));
    document.getElementById('btn-intro-play')!.addEventListener('click', () => {
      this.startNight(this.currentNight);
    });

    document.getElementById('btn-resume')!.addEventListener('click', () => {
      if (this.screenMode === 'paused') this.pauseToggleQueued = true;
    });
    document.getElementById('btn-pause-restart')!.addEventListener('click', () => {
      this.startNight(this.currentNight);
    });
    document.getElementById('btn-pause-menu')!.addEventListener('click', () => {
      this.sound.stopBgm();
      this.setScreen('menu');
    });

    const openSettings = (returnTo: ScreenMode) => {
      this.settingsReturnTo = returnTo;
      this.menuScreen.classList.remove('visible');
      this.pauseScreen.classList.remove('visible');
      this.settingsScreen.classList.add('visible');
    };
    document.getElementById('btn-menu-settings')!.addEventListener('click', () => openSettings('menu'));
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => openSettings('paused'));
    document.getElementById('btn-settings-close')!.addEventListener('click', () => {
      this.settingsScreen.classList.remove('visible');
      this.setScreen(this.settingsReturnTo);
    });

    this.sliderVolume.addEventListener('input', () => {
      const pct = Number.parseInt(this.sliderVolume.value, 10);
      this.valVolume.textContent = `${pct}%`;
      this.sound.setVolume(pct / 100);
    });
    this.sliderSens.addEventListener('input', () => {
      const val = Number.parseInt(this.sliderSens.value, 10) / 100;
      this.mouseSensitivity = val;
      this.valSens.textContent = val.toFixed(2);
      window.localStorage.setItem('ddl_sensitivity', String(val));
    });
    this.toggleColorblind.addEventListener('change', () => {
      this.colorblindMode = this.toggleColorblind.checked;
      document.body.classList.toggle('colorblind', this.colorblindMode);
      window.localStorage.setItem('ddl_colorblind', String(this.colorblindMode));
    });

    this.btnResultNext.addEventListener('click', () => {
      if (this.currentNight < 3) {
        this.openNightIntro((this.currentNight + 1) as NightId, false);
      }
    });
    document.getElementById('btn-result-retry')!.addEventListener('click', () => {
      this.startNight(this.currentNight);
    });
    document.getElementById('btn-result-menu')!.addEventListener('click', () => {
      this.sound.stopBgm();
      this.setScreen('menu');
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsedVisual += frameDt;

    if (this.screenMode === 'playing' || this.screenMode === 'paused') {
      this.accumulator += frameDt;
      while (this.accumulator >= DT) {
        if (this.sim.state === 'playing' || this.sim.state === 'paused') {
          const input = this.pollInput();
          const events = this.sim.step(input);
          if (events.length > 0) this.handleEvents(events);
        }
        this.accumulator -= DT;
      }
    }

    for (const c of this.clouds) {
      c.userData.angle += c.userData.speed * frameDt;
      c.position.x = Math.cos(c.userData.angle) * c.userData.dist;
      c.position.z = Math.sin(c.userData.angle) * c.userData.dist;
    }

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
    this.updateOcclusion(frameDt);
    this.renderer.render(this.scene, this.camera);
  };
}

const container = document.getElementById('canvas-container');
if (container) {
  new DaoDenLongApp(container);
}

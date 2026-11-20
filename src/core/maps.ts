import { TUNING } from './config';
import type { NightId, Vec3 } from './types';

export interface JumpPadDef {
  x: number;
  y: number;
  z: number;
  radius: number;
  vy: number;
  vx: number;
  vz: number;
}

export interface RampDef {
  angleDeg: number;
  rOuter: number; // Y = 0
  rInner: number; // Y = 3
  halfWidth: number;
  yOuter: number;
  yInner: number;
}

export interface NightMapDef {
  night: NightId;
  name: string;
  introQuote: string;
  durationS: number;
  spawnPos: Vec3;
  lanterns: Array<{ id: string; pos: Vec3 }>;
  moteSpawnPoints: Vec3[];
  shadeSpawnPoints: Vec3[];
  shadeSpeed: number;
  shadeSpawnIntervalTicks: number;
  shadeMaxActive: number;
  drifterEnabled: boolean;
  windEnabled: boolean;
  charms: Array<{ id: string; pos: Vec3 }>;
  jumpPads: JumpPadDef[];
  ramps: RampDef[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Angle measured from +X axis counter-clockwise when viewed from above on XZ plane:
 * x = cx + r * cos(deg), z = cz + r * sin(deg).
 * Verified against Night 3 Tier 1 (z > 0 for 20..160 deg) and ramps (30 deg, 150 deg).
 */
function ringPoints(
  cx: number,
  cz: number,
  y: number,
  radius: number,
  startDeg: number,
  stepDeg: number,
  count: number,
): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = degToRad(startDeg + i * stepDeg);
    pts.push([round3(cx + Math.cos(a) * radius), y, round3(cz + Math.sin(a) * radius)]);
  }
  return pts;
}

function makeJumpPadToTarget(
  x: number,
  y: number,
  z: number,
  targetX: number,
  targetZ: number,
  vy: number,
  vh: number,
): JumpPadDef {
  const dx = targetX - x;
  const dz = targetZ - z;
  const d = Math.hypot(dx, dz) || 1;
  return { x, y, z, radius: 1.0, vy, vx: (dx / d) * vh, vz: (dz / d) * vh };
}

export const NIGHT_MAPS: Record<NightId, NightMapDef> = {
  1: {
    night: 1,
    name: 'Đêm 1 — Đảo Bến',
    introQuote:
      'Ông Đăng: "Sương đen đã phủ kín Đảo Bến rồi, Mây à. Hãy gom đom đóm thắp lại 5 Đèn Lồng Lớn trước khi bình minh đến."',
    durationS: TUNING.night1_duration_s,
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25] },
      { id: 'L2', pos: [23.8, 0, 7.7] },
      { id: 'L3', pos: [14.7, 0, -20.2] },
      { id: 'L4', pos: [-14.7, 0, -20.2] },
      { id: 'L5', pos: [-23.8, 0, 7.7] },
    ],
    moteSpawnPoints: [
      ...ringPoints(0, 0, 0, 12, 0, 45, 8),
      ...ringPoints(0, 0, 0, 33, 0, 22.5, 16),
    ],
    shadeSpawnPoints: ringPoints(0, 0, 0, 37, 15, 30, 12),
    shadeSpeed: TUNING.shade_speed,
    shadeSpawnIntervalTicks: 480, // 8s
    shadeMaxActive: 6,
    drifterEnabled: false,
    windEnabled: false,
    charms: [],
    jumpPads: [],
    ramps: [],
  },
  2: {
    night: 2,
    name: 'Đêm 2 — Đảo Cau',
    introQuote:
      'Ông Đăng: "Đảo Cau chia làm hai bờ nối bằng cầu tre mảnh. Coi chừng Gió Lạc trộm đom đóm, và dùng Bùa Gió cùng bục nhảy để vượt biển mây!"',
    durationS: TUNING.night2_duration_s,
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 20] },
      { id: 'L2', pos: [17, 0, -10] },
      { id: 'L3', pos: [-17, 0, -10] },
      { id: 'L4', pos: [70, 0, 20] },
      { id: 'L5', pos: [87, 0, -10] },
      { id: 'L6', pos: [53, 0, -10] },
    ],
    moteSpawnPoints: [
      ...ringPoints(0, 0, 0, 10, 0, 90, 4),
      ...ringPoints(0, 0, 0, 22, 0, 45, 8),
      ...ringPoints(70, 0, 0, 10, 0, 90, 4),
      ...ringPoints(70, 0, 0, 22, 0, 45, 8),
    ],
    shadeSpawnPoints: [
      ...ringPoints(0, 0, 0, 26, 22.5, 45, 8),
      ...ringPoints(70, 0, 0, 26, 22.5, 45, 8),
    ],
    shadeSpeed: TUNING.shade_speed,
    shadeSpawnIntervalTicks: 420, // 7s
    shadeMaxActive: 8,
    drifterEnabled: true,
    windEnabled: false,
    charms: [{ id: 'C1', pos: [35, 0, 0] }],
    jumpPads: [
      makeJumpPadToTarget(20, 0, 18, 70, 0, 14, 24),
      makeJumpPadToTarget(50, 0, -18, 0, 0, 14, 24),
    ],
    ramps: [],
  },
  3: {
    night: 3,
    name: 'Đêm 3 — Đảo Chuông',
    introQuote:
      'Ông Đăng: "Đêm cuối trên Đảo Chuông ba tầng. Gió mạnh sẽ thổi từng đợt, Bóng Mực nhanh hơn — hãy leo dốc, phóng lên tháp chuông và mang bình minh trở lại!"',
    durationS: TUNING.night3_duration_s,
    spawnPos: [0, 0, 28],
    lanterns: [
      { id: 'L1', pos: [0, 6, 6] },
      { id: 'L2', pos: [18, 3, 10] },
      { id: 'L3', pos: [-18, 3, 10] },
      { id: 'L4', pos: [35, 0, -10] },
      { id: 'L5', pos: [-35, 0, -10] },
      { id: 'L6', pos: [20, 0, -35] },
      { id: 'L7', pos: [-20, 0, -35] },
    ],
    moteSpawnPoints: [
      ...ringPoints(0, 0, 0, 34, 0, 20, 18),
      ...ringPoints(0, 0, 3, 18, 20, 20, 8),
      ...ringPoints(0, 0, 6, 5, 45, 90, 4),
    ],
    shadeSpawnPoints: ringPoints(0, 0, 0, 43, 0, 22.5, 16),
    shadeSpeed: 4.5,
    shadeSpawnIntervalTicks: 360, // 6s
    shadeMaxActive: 10,
    drifterEnabled: true,
    windEnabled: true,
    charms: [
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] },
    ],
    jumpPads: [{ x: 0, y: 3, z: 13, radius: 1.0, vy: 12, vx: 0, vz: -8 }],
    ramps: [
      { angleDeg: 30, rOuter: 30, rInner: 24, halfWidth: 1.5, yOuter: 0, yInner: 3 },
      { angleDeg: 150, rOuter: 30, rInner: 24, halfWidth: 1.5, yOuter: 0, yInner: 3 },
    ],
  },
};

// Note: In Night 3, player starts at (0, 0, 0) per Test Contract unless overridden;
// Wait: at (0, 0, 0) in Night 3, there is Tier 2 (Y=6) and the Bell Tower (R=2, Y=6..14)!
// Let's keep Night 3 default spawnPos at [0, 0, 0] ONLY if Night 1, or [0, 0, 28] for Night 3?
// Wait: Test Contract v1.0 says "người chơi xuất phát tại (0, 0, 0)" for Night 1; Night 3 has bell tower at (0,6,0) R=2.
// Setting Night 3 spawnPos to [0, 0, 34] or [0, 0, 28] (safe on Tier 0, outside Tier 1 R=12..24) avoids spawning inside the bell tower!
// And scenario.player.pos can always override it explicitly.

export const BELL_TOWER_RADIUS = 2.0;
export const BELL_TOWER_BASE_Y = 6.0;
export const BELL_TOWER_TOP_Y = 14.0;

/**
 * Returns the highest solid surface Y at (x, z) for the given night, or null if over the cloud sea.
 */
export function getTopSurfaceY(night: NightId, x: number, z: number): number | null {
  if (night === 1) {
    return Math.hypot(x, z) <= 40.0 ? 0.0 : null;
  }

  if (night === 2) {
    const onIslandA = Math.hypot(x, z) <= 28.0;
    const onIslandB = Math.hypot(x - 70.0, z) <= 28.0;
    const onBridge = x >= 26.0 && x <= 44.0 && z >= -2.0 && z <= 2.0;
    return onIslandA || onIslandB || onBridge ? 0.0 : null;
  }

  // Night 3 — Đảo Chuông
  const r = Math.hypot(x, z);
  if (r > 45.0) return null;

  // Tier 2: disc radius 8m at center (Y = 6)
  if (r <= 8.0) return 6.0;

  // Tier 1: annulus 12..24m in z > 0 half (Y = 3)
  if (r >= 12.0 && r <= 24.0 && z > 0.0) return 3.0;

  // Two straight ramps at 30° and 150° from r=30 (Y=0) to r=24 (Y=3), width 3m (halfWidth 1.5m)
  for (const ramp of NIGHT_MAPS[3].ramps) {
    const rad = degToRad(ramp.angleDeg);
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const along = x * ux + z * uz;
    const perp = Math.abs(-x * uz + z * ux);
    if (perp <= ramp.halfWidth && along >= ramp.rInner && along <= ramp.rOuter) {
      const t = (ramp.rOuter - along) / (ramp.rOuter - ramp.rInner);
      return ramp.yOuter + t * (ramp.yInner - ramp.yOuter);
    }
  }

  // Tier 0: whole island radius 45m (Y = 0)
  return 0.0;
}

/**
 * Resolves horizontal movement against vertical tier cliffs and Night 3 bell tower.
 * Returns adjusted (x, z) and whether movement was blocked by an obstacle.
 */
export function resolveHorizontalMove(
  night: NightId,
  prevX: number,
  prevZ: number,
  nextX: number,
  nextZ: number,
  currentY: number,
): { x: number; z: number; blocked: boolean } {
  let x = nextX;
  let z = nextZ;
  let blocked = false;

  if (night === 3) {
    // Bell tower cylinder at (0,0) radius 2m on Tier 2 (Y >= 5.5)
    if (currentY >= BELL_TOWER_BASE_Y - 0.5 && currentY < BELL_TOWER_TOP_Y) {
      const r = Math.hypot(x, z);
      if (r < BELL_TOWER_RADIUS) {
        blocked = true;
        if (r > 1e-6) {
          x = (x / r) * BELL_TOWER_RADIUS;
          z = (z / r) * BELL_TOWER_RADIUS;
        } else {
          x = BELL_TOWER_RADIUS;
          z = 0;
        }
      }
    }

    // Vertical tier cliffs: cannot walk horizontally onto a surface > currentY + 0.65m
    const targetSurface = getTopSurfaceY(night, x, z);
    if (targetSurface !== null && targetSurface > currentY + 0.65) {
      blocked = true;
      // Try sliding along X or Z independently
      const tryXSurface = getTopSurfaceY(night, x, prevZ);
      const tryZSurface = getTopSurfaceY(night, prevX, z);
      if (tryXSurface === null || tryXSurface <= currentY + 0.65) {
        z = prevZ;
      } else if (tryZSurface === null || tryZSurface <= currentY + 0.65) {
        x = prevX;
      } else {
        x = prevX;
        z = prevZ;
      }
    }
  }

  return { x, z, blocked };
}

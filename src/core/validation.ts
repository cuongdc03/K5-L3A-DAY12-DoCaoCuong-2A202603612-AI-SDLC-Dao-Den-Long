import type {
  DrifterState,
  InputFrame,
  InputsFile,
  MoteKind,
  ScenarioFile,
  ShadeState,
  Vec2,
  Vec3,
} from './types';

export class ContractFormatError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractFormatError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeState>([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
]);

const VALID_DRIFTER_STATES = new Set<DrifterState>(['idle', 'chase', 'flee', 'removed']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    isFiniteNumber(value[2])
  );
}

function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

export function validateInputsFile(raw: unknown): InputsFile {
  if (!isObject(raw)) {
    throw new ContractFormatError('Inputs file must be a JSON object.');
  }
  if (!Array.isArray(raw.frames)) {
    throw new ContractFormatError('Inputs file must contain a "frames" array.');
  }

  let prevTick = -1;
  const frames: InputFrame[] = [];

  for (let i = 0; i < raw.frames.length; i++) {
    const f = raw.frames[i];
    if (!isObject(f)) {
      throw new ContractFormatError(`frames[${i}] must be an object.`);
    }
    if (!isNonNegInt(f.tick)) {
      throw new ContractFormatError(`frames[${i}].tick must be a non-negative integer.`);
    }
    const tick = f.tick;
    if (tick <= prevTick) {
      throw new ContractFormatError(
        `frames[${i}].tick (${tick}) must be strictly greater than previous tick (${prevTick}).`,
      );
    }
    prevTick = tick;

    const parsed: InputFrame = { tick };

    if (f.move !== undefined) {
      if (!isVec2(f.move)) {
        throw new ContractFormatError(`frames[${i}].move must be [x, z] finite numbers.`);
      }
      if (f.move[0] < -1 || f.move[0] > 1 || f.move[1] < -1 || f.move[1] > 1) {
        throw new ContractFormatError(`frames[${i}].move components must be within [-1, 1].`);
      }
      parsed.move = [f.move[0], f.move[1]];
    }

    if (f.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(f.cam_yaw_deg)) {
        throw new ContractFormatError(`frames[${i}].cam_yaw_deg must be a finite number.`);
      }
      parsed.cam_yaw_deg = f.cam_yaw_deg;
    }

    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (f[key] !== undefined) {
        if (typeof f[key] !== 'boolean') {
          throw new ContractFormatError(`frames[${i}].${key} must be a boolean.`);
        }
        parsed[key] = f[key] as boolean;
      }
    }

    frames.push(parsed);
  }

  return { frames };
}

export function validateScenarioFile(raw: unknown): ScenarioFile {
  if (!isObject(raw)) {
    throw new ContractFormatError('Scenario file must be a JSON object.');
  }

  const result: ScenarioFile = {};

  if (raw.player !== undefined) {
    if (!isObject(raw.player)) {
      throw new ContractFormatError('scenario.player must be an object.');
    }
    result.player = {};
    if (raw.player.pos !== undefined) {
      if (!isVec3(raw.player.pos)) {
        throw new ContractFormatError('scenario.player.pos must be [x, y, z].');
      }
      result.player.pos = raw.player.pos;
    }
    for (const key of [
      'carried',
      'flames',
      'invuln_ticks',
      'dash_cd_ticks',
      'pulse_cd_ticks',
      'charm_ticks',
    ] as const) {
      if (raw.player[key] !== undefined) {
        if (!isNonNegInt(raw.player[key])) {
          throw new ContractFormatError(`scenario.player.${key} must be a non-negative integer.`);
        }
        result.player[key] = raw.player[key] as number;
      }
    }
  }

  for (const flag of [
    'random_motes',
    'random_shades',
    'random_drifters',
    'wind_enabled',
  ] as const) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== 'boolean') {
        throw new ContractFormatError(`scenario.${flag} must be a boolean.`);
      }
      result[flag] = raw[flag] as boolean;
    }
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractFormatError('scenario.motes must be an array.');
    }
    result.motes = raw.motes.map((item, idx) => {
      if (isVec3(item)) {
        return item;
      }
      if (isObject(item) && isVec3(item.pos)) {
        if (item.id !== undefined && typeof item.id !== 'string') {
          throw new ContractFormatError(`scenario.motes[${idx}].id must be a string.`);
        }
        if (item.kind !== undefined && item.kind !== 'random' && item.kind !== 'dropped') {
          throw new ContractFormatError(`scenario.motes[${idx}].kind must be "random" or "dropped".`);
        }
        if (item.ttl_s !== undefined && item.ttl_s !== null && (!isFiniteNumber(item.ttl_s) || item.ttl_s < 0)) {
          throw new ContractFormatError(`scenario.motes[${idx}].ttl_s must be non-negative or null.`);
        }
        return {
          id: item.id as string | undefined,
          pos: item.pos,
          kind: item.kind as MoteKind | undefined,
          ttl_s: item.ttl_s as number | null | undefined,
        };
      }
      throw new ContractFormatError(
        `scenario.motes[${idx}] must be [x, y, z] or { id?, pos: [x, y, z] }.`,
      );
    });
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ContractFormatError('scenario.shades must be an array.');
    }
    result.shades = raw.shades.map((item, idx) => {
      if (!isObject(item) || !isVec3(item.pos)) {
        throw new ContractFormatError(`scenario.shades[${idx}] must be an object with pos: [x, y, z].`);
      }
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractFormatError(`scenario.shades[${idx}].id must be a string.`);
      }
      if (item.state !== undefined && !VALID_SHADE_STATES.has(item.state as ShadeState)) {
        throw new ContractFormatError(
          `scenario.shades[${idx}].state must be one of spawning, wander, chase, recoil, stunned.`,
        );
      }
      if (item.state_ticks_left !== undefined && !isNonNegInt(item.state_ticks_left)) {
        throw new ContractFormatError(
          `scenario.shades[${idx}].state_ticks_left must be a non-negative integer.`,
        );
      }
      return {
        id: item.id as string | undefined,
        pos: item.pos,
        state: item.state as ShadeState | undefined,
        state_ticks_left: item.state_ticks_left as number | undefined,
      };
    });
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ContractFormatError('scenario.drifters must be an array.');
    }
    result.drifters = raw.drifters.map((item, idx) => {
      if (!isObject(item) || !isVec3(item.pos)) {
        throw new ContractFormatError(`scenario.drifters[${idx}] must be an object with pos: [x, y, z].`);
      }
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractFormatError(`scenario.drifters[${idx}].id must be a string.`);
      }
      if (item.state !== undefined && !VALID_DRIFTER_STATES.has(item.state as DrifterState)) {
        throw new ContractFormatError(
          `scenario.drifters[${idx}].state must be one of idle, chase, flee, removed.`,
        );
      }
      if (item.stolen !== undefined && !isNonNegInt(item.stolen)) {
        throw new ContractFormatError(`scenario.drifters[${idx}].stolen must be a non-negative integer.`);
      }
      return {
        id: item.id as string | undefined,
        pos: item.pos,
        state: item.state as DrifterState | undefined,
        stolen: item.stolen as number | undefined,
      };
    });
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ContractFormatError('scenario.charms must be an array.');
    }
    result.charms = raw.charms.map((item, idx) => {
      if (!isObject(item) || !isVec3(item.pos)) {
        throw new ContractFormatError(`scenario.charms[${idx}] must be an object with pos: [x, y, z].`);
      }
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractFormatError(`scenario.charms[${idx}].id must be a string.`);
      }
      if (item.available !== undefined && typeof item.available !== 'boolean') {
        throw new ContractFormatError(`scenario.charms[${idx}].available must be a boolean.`);
      }
      if (item.respawn_s !== undefined && (!isFiniteNumber(item.respawn_s) || item.respawn_s < 0)) {
        throw new ContractFormatError(`scenario.charms[${idx}].respawn_s must be non-negative.`);
      }
      return {
        id: item.id as string | undefined,
        pos: item.pos,
        available: item.available as boolean | undefined,
        respawn_s: item.respawn_s as number | undefined,
      };
    });
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ContractFormatError('scenario.lanterns must be an array.');
    }
    result.lanterns = raw.lanterns.map((item, idx) => {
      if (!isObject(item) || typeof item.id !== 'string') {
        throw new ContractFormatError(`scenario.lanterns[${idx}] must be an object with string id.`);
      }
      if (item.pos !== undefined && !isVec3(item.pos)) {
        throw new ContractFormatError(`scenario.lanterns[${idx}].pos must be [x, y, z].`);
      }
      if (item.deposited !== undefined && !isNonNegInt(item.deposited)) {
        throw new ContractFormatError(`scenario.lanterns[${idx}].deposited must be a non-negative integer.`);
      }
      if (item.lit !== undefined && typeof item.lit !== 'boolean') {
        throw new ContractFormatError(`scenario.lanterns[${idx}].lit must be a boolean.`);
      }
      return {
        id: item.id,
        pos: item.pos as Vec3 | undefined,
        deposited: item.deposited as number | undefined,
        lit: item.lit as boolean | undefined,
      };
    });
  }

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s) || raw.time_left_s <= 0) {
      throw new ContractFormatError('scenario.time_left_s must be a positive finite number.');
    }
    result.time_left_s = raw.time_left_s;
  }

  return result;
}

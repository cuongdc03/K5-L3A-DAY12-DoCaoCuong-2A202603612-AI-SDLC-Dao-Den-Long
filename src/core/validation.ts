import type { InputFrame, InputsFile, ScenarioFile, Vec2, Vec3 } from './types';

export class ContractFormatError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractFormatError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
    if (!Number.isInteger(f.tick) || (f.tick as number) < 0) {
      throw new ContractFormatError(`frames[${i}].tick must be a non-negative integer.`);
    }
    const tick = f.tick as number;
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

    for (const key of ['jump', 'interact', 'pulse', 'dash'] as const) {
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
    if (raw.player.carried !== undefined) {
      if (!Number.isInteger(raw.player.carried) || (raw.player.carried as number) < 0) {
        throw new ContractFormatError('scenario.player.carried must be a non-negative integer.');
      }
      result.player.carried = raw.player.carried as number;
    }
    if (raw.player.flames !== undefined) {
      if (!Number.isInteger(raw.player.flames) || (raw.player.flames as number) < 0) {
        throw new ContractFormatError('scenario.player.flames must be a non-negative integer.');
      }
      result.player.flames = raw.player.flames as number;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== 'boolean') {
      throw new ContractFormatError('scenario.random_motes must be a boolean.');
    }
    result.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== 'boolean') {
      throw new ContractFormatError('scenario.random_shades must be a boolean.');
    }
    result.random_shades = raw.random_shades;
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
        return { id: item.id as string | undefined, pos: item.pos };
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
      if (item.state !== undefined && item.state !== 'chase' && item.state !== 'stunned') {
        throw new ContractFormatError(`scenario.shades[${idx}].state must be "chase" or "stunned".`);
      }
      return {
        id: item.id as string | undefined,
        pos: item.pos,
        state: item.state as 'chase' | 'stunned' | undefined,
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
      if (item.deposited !== undefined && (!Number.isInteger(item.deposited) || (item.deposited as number) < 0)) {
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

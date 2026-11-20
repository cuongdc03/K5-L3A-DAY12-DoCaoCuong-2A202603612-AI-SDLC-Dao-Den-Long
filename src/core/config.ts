import contractJson from '../../game.contract.json';
import type { ContractFile, TuningConfig } from './types';

export const CONTRACT: ContractFile = contractJson as ContractFile;
export const TUNING: TuningConfig = CONTRACT.tuning;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// Island geometry & movement constants (not in contract tuning)
export const ISLAND_RADIUS = 40.0;
export const LANTERN_RING_RADIUS = 25.0;
export const JUMP_VELOCITY = 7.5;
export const GRAVITY = 20.0;
export const DIST_EPS = 1e-9;

// Spawning constants when random_motes / random_shades are enabled
export const INITIAL_RANDOM_MOTES = 20;
export const MIN_RANDOM_MOTES = 15;
export const MAX_RANDOM_MOTES = 20;
export const MOTE_RESPAWN_INTERVAL_TICKS = 180; // every 3s

export const INITIAL_RANDOM_SHADES = 2;
export const MAX_RANDOM_SHADES = 5;
export const SHADE_SPAWN_INTERVAL_TICKS = 1500; // every 25s
export const SHADE_DISPLAY_Y = 0.0;

import contractJson from '../../game.contract.json';
import type { ContractFile, TuningConfig } from './types';

export const CONTRACT: ContractFile = contractJson as ContractFile;
export const TUNING: TuningConfig = CONTRACT.tuning;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const DIST_EPS = 1e-9;

// Standard Physics & Movement Constants (TICKET-02 Part 1)
export const ACCEL_TIME_S = 0.08; // <= 0.1s ramp up / stop
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = 20.0;
export const DASH_TICKS = Math.round(TUNING.dash_duration_s * TICK_RATE); // 12
export const DASH_CD_TICKS = Math.round(TUNING.dash_cooldown_s * TICK_RATE); // 90
export const PULSE_CD_TICKS = Math.round(TUNING.pulse_cooldown_s * TICK_RATE); // 180
export const PULSE_STUN_TICKS = Math.round(TUNING.pulse_stun_s * TICK_RATE); // 120
export const PULSE_PUSH_TICKS = 15;
export const PULSE_CENTER_Y_OFFSET = 0.8;
export const SHADE_CENTER_Y_OFFSET = 0.8;

// Pickup & Hit Vertical Thresholds
export const PICKUP_MAX_DY = 1.5;
export const SHADE_HIT_MAX_DY = 1.5;

// Mote Spawning & Dropped Motes
export const INITIAL_MOTES = 20;
export const MAX_MOTES = 30;
export const MOTE_SPAWN_INTERVAL_TICKS = 240;
export const DROPPED_MOTE_TTL_TICKS = 480;

// Shade AI & Spawning
export const SHADE_DETECT_RADIUS = 12.0;
export const SHADE_LOSE_RADIUS = 18.0;
export const SHADE_WANDER_SPEED = 2.0;
export const SHADE_RECOIL_DIST = 2.0;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_SPAWNING_TICKS = 30;
export const SHADE_FIRST_SPAWN_TICK = 300;
export const SHADE_MIN_SPAWN_DIST = 15.0;
export const SAFE_PUSH_MAX_TICKS = 30;

// Damage & Fall
export const INVULN_TICKS = Math.round(TUNING.invuln_s * TICK_RATE); // 90
export const FALL_Y_THRESHOLD = -10.0;
export const FALL_RESPAWN_WAIT_TICKS = 60;

// Drifters (Gió Lạc — Nights 2 & 3)
export const DRIFTER_IDLE_SPEED = 2.0;
export const DRIFTER_SPEED = 7.0;
export const DRIFTER_DETECT_RADIUS = 15.0;
export const DRIFTER_MIN_CARRIED = 5;
export const DRIFTER_STEAL_RADIUS = 1.2;
export const DRIFTER_MAX_STEAL = 3;
export const DRIFTER_FLEE_TICKS = 240;
export const DRIFTER_PULSE_DROP_FLEE_TICKS = 120;
export const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
export const DRIFTER_MAX_ACTIVE = 2;

// Wind Charm (Bùa Gió)
export const CHARM_DURATION_TICKS = 600;
export const CHARM_SPEED = 7.2;
export const CHARM_RESPAWN_TICKS = 2700;

// Night 3 Strong Wind
export const WIND_INTERVAL_TICKS = 1800; // every 30s
export const WIND_DURATION_TICKS = 300; // 5s
export const WIND_WARNING_TICKS = 120; // 2s warning before wind
export const WIND_PUSH_SPEED = 2.0;

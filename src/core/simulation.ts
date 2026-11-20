import {
  ACCEL_TIME_S,
  CHARM_DURATION_TICKS,
  CHARM_RESPAWN_TICKS,
  CHARM_SPEED,
  DASH_CD_TICKS,
  DASH_TICKS,
  DIST_EPS,
  DRIFTER_DETECT_RADIUS,
  DRIFTER_FLEE_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_ACTIVE,
  DRIFTER_MAX_STEAL,
  DRIFTER_MIN_CARRIED,
  DRIFTER_PULSE_DROP_FLEE_TICKS,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_SPEED,
  DRIFTER_STEAL_RADIUS,
  DROPPED_MOTE_TTL_TICKS,
  DT,
  FALL_RESPAWN_WAIT_TICKS,
  FALL_Y_THRESHOLD,
  FUEL_DECAY_PER_TICK_60,
  FUEL_DRAIN_PER_TICK_60,
  FUEL_MAX_60,
  FUEL_PER_MOTE_60,
  GRAVITY,
  INITIAL_MOTES,
  INVULN_TICKS,
  JUMP_VELOCITY,
  LOW_FUEL_THRESHOLD_60,
  MAX_MOTES,
  MOTE_SPAWN_INTERVAL_TICKS,
  PICKUP_MAX_DY,
  PULSE_CD_TICKS,
  PULSE_CENTER_Y_OFFSET,
  PULSE_PUSH_TICKS,
  PULSE_STUN_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SCORE_DAWN_LANTERN_BASE,
  SCORE_RELIGHT,
  SCORE_STUN_DRAINING,
  SHADE_CENTER_Y_OFFSET,
  SHADE_DETECT_RADIUS,
  SHADE_DRAIN_PLAYER_AGGRO_RADIUS,
  SHADE_DRAIN_RADIUS,
  SHADE_FIRST_SPAWN_TICK,
  SHADE_HIT_MAX_DY,
  SHADE_LOSE_RADIUS,
  SHADE_MIN_SPAWN_DIST,
  SHADE_RECOIL_DIST,
  SHADE_RECOIL_TICKS,
  SHADE_SPAWNING_TICKS,
  SHADE_WANDER_SPEED,
  TICK_RATE,
  TUNING,
  WIND_DURATION_TICKS,
  WIND_INTERVAL_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARNING_TICKS,
} from './config';
import { getTopSurfaceY, NIGHT_MAPS, type NightMapDef, resolveHorizontalMove } from './maps';
import { SeededRNG } from './prng';
import type {
  CharmEntity,
  DrifterEntity,
  EndRecord,
  EventName,
  EventRecord,
  GameStatus,
  InputFrame,
  InputState,
  LanternEntity,
  MoteEntity,
  NightId,
  PlayerEntity,
  ScenarioFile,
  ShadeEntity,
  SnapshotRecord,
  TuningConfig,
  WindState,
} from './types';

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function round1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function dist3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

export function createDefaultInputState(): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
}

export interface SimulationOptions {
  seed: number;
  night?: NightId;
  scenario?: ScenarioFile;
  tuning?: TuningConfig;
}

export class GameSimulation {
  readonly seed: number;
  readonly night: NightId;
  readonly map: NightMapDef;
  readonly tuning: TuningConfig;
  readonly rng: SeededRNG;

  tick = 0;
  simTick = 0;
  state: GameStatus = 'playing';
  score = 0;
  initialTimeLeftS: number;
  timeLeftS: number;

  player: PlayerEntity;
  lanterns: LanternEntity[] = [];
  shades: ShadeEntity[] = [];
  motes: MoteEntity[] = [];
  drifters: DrifterEntity[] = [];
  charms: CharmEntity[] = [];
  wind: WindState = { active: false, warning: false, dir_deg: 0, ticksLeft: 0 };

  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;

  private usedMoteIds = new Set<string>();
  private usedShadeIds = new Set<string>();
  private usedDrifterIds = new Set<string>();
  private moteSeq = 1;
  private shadeSeq = 1;
  private drifterSeq = 1;
  private prevInput: InputState = createDefaultInputState();

  constructor(options: SimulationOptions) {
    this.seed = options.seed;
    this.night = options.night ?? 1;
    this.map = NIGHT_MAPS[this.night];
    this.tuning = options.tuning ?? TUNING;
    this.rng = new SeededRNG(this.seed ^ (this.night * 0x9e3779b9));

    const scenario = options.scenario;
    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;
    this.randomDrifters = scenario?.random_drifters ?? this.map.drifterEnabled;
    this.windEnabled = scenario?.wind_enabled ?? this.map.windEnabled;

    this.initialTimeLeftS = scenario?.time_left_s ?? this.map.durationS;
    this.timeLeftS = this.initialTimeLeftS;

    // Initialize player
    const pPos = scenario?.player?.pos ?? this.map.spawnPos;
    const groundY = getTopSurfaceY(this.night, pPos[0], pPos[2]);
    const grounded = groundY !== null && Math.abs(pPos[1] - groundY) <= 0.05;
    this.player = {
      x: pPos[0],
      y: pPos[1],
      z: pPos[2],
      vx: 0,
      vy: 0,
      vz: 0,
      grounded,
      facingYaw: 0,
      flames: scenario?.player?.flames ?? this.tuning.flames,
      carried: scenario?.player?.carried ?? 0,
      successfulLights: scenario?.player?.successful_lights ?? 0,
      invulnTicks: scenario?.player?.invuln_ticks ?? 0,
      dashTimerTicks: 0,
      dashCdTicks: scenario?.player?.dash_cd_ticks ?? 0,
      dashDirX: 0,
      dashDirZ: 1,
      pulseCdTicks: scenario?.player?.pulse_cd_ticks ?? 0,
      charmTicks: scenario?.player?.charm_ticks ?? 0,
      padLaunched: false,
      respawnWaitTicks: 0,
    };

    // Initialize lanterns from standard map
    for (const def of this.map.lanterns) {
      this.lanterns.push({
        id: def.id,
        x: def.pos[0],
        y: def.pos[1],
        z: def.pos[2],
        lit: false,
        deposited: 0,
        fuel60: 0,
        everLit: false,
        relitCount: 0,
      });
    }

    // Apply scenario lantern overrides (no events, no score, does not increment successfulLights)
    if (scenario?.lanterns) {
      for (const override of scenario.lanterns) {
        const existing = this.lanterns.find((l) => l.id === override.id);
        if (existing) {
          if (override.pos) {
            existing.x = override.pos[0];
            existing.y = override.pos[1];
            existing.z = override.pos[2];
          }
          if (override.deposited !== undefined) {
            existing.deposited = override.deposited;
          }
          if (override.lit !== undefined) {
            existing.lit = override.lit;
            if (override.lit) {
              existing.fuel60 =
                override.fuel !== undefined ? Math.round(override.fuel * TICK_RATE) : FUEL_MAX_60;
              existing.everLit = override.ever_lit ?? true;
              if (override.deposited === undefined) {
                existing.deposited = Math.max(existing.deposited, this.tuning.lantern_cost);
              }
            } else {
              existing.fuel60 = 0;
            }
          } else if (override.fuel !== undefined) {
            existing.fuel60 = Math.round(override.fuel * TICK_RATE);
          }
          if (override.ever_lit !== undefined) {
            existing.everLit = override.ever_lit;
          }
        }
      }
    }

    // Initialize motes
    if (scenario?.motes !== undefined) {
      for (const m of scenario.motes) {
        if (Array.isArray(m)) {
          const id = this.allocMoteId();
          this.motes.push({
            id,
            x: m[0],
            y: m[1],
            z: m[2],
            kind: 'random',
            ttlTicks: null,
            createdTick: -1,
          });
        } else {
          const id = m.id ?? this.allocMoteId();
          this.usedMoteIds.add(id);
          const kind = m.kind ?? 'random';
          const ttlTicks =
            m.ttl_s !== undefined && m.ttl_s !== null
              ? Math.round(m.ttl_s * TICK_RATE)
              : kind === 'dropped'
                ? DROPPED_MOTE_TTL_TICKS
                : null;
          this.motes.push({
            id,
            x: m.pos[0],
            y: m.pos[1],
            z: m.pos[2],
            kind,
            ttlTicks,
            createdTick: -1,
          });
        }
      }
    } else if (this.randomMotes) {
      const indices = this.map.moteSpawnPoints.map((_, idx) => idx);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const count = Math.min(INITIAL_MOTES, indices.length);
      for (let i = 0; i < count; i++) {
        const pt = this.map.moteSpawnPoints[indices[i]];
        this.motes.push({
          id: this.allocMoteId(),
          x: pt[0],
          y: pt[1],
          z: pt[2],
          kind: 'random',
          ttlTicks: null,
          createdTick: -1,
        });
      }
    }

    // Initialize shades
    if (scenario?.shades !== undefined) {
      for (const s of scenario.shades) {
        const id = s.id ?? this.allocShadeId();
        this.usedShadeIds.add(id);
        const st = s.state ?? 'chase';
        const defaultTicks =
          st === 'stunned'
            ? PULSE_STUN_TICKS
            : st === 'recoil'
              ? SHADE_RECOIL_TICKS
              : st === 'spawning'
                ? SHADE_SPAWNING_TICKS
                : 0;
        this.shades.push({
          id,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          state: st,
          stateTicksLeft: s.state_ticks_left ?? defaultTicks,
          pushTicksLeft: 0,
          pushDirX: 1,
          pushDirZ: 0,
          recoilDirX: 1,
          recoilDirZ: 0,
          safePushTicks: 0,
          safePushLanternId: null,
          targetLanternId: s.target_lantern_id ?? null,
          drainTicks: 0,
          wanderAngle: this.rng.next() * Math.PI * 2,
          wanderChangeTicks: 60,
          createdTick: -1,
        });
      }
    }

    // Initialize drifters
    if (scenario?.drifters !== undefined) {
      for (const d of scenario.drifters) {
        const id = d.id ?? this.allocDrifterId();
        this.usedDrifterIds.add(id);
        const st = d.state ?? 'idle';
        this.drifters.push({
          id,
          x: d.pos[0],
          y: d.pos[1],
          z: d.pos[2],
          state: st,
          stolen: d.stolen ?? 0,
          hasStolen: (d.stolen ?? 0) > 0 || st === 'flee',
          fleeTicksLeft: st === 'flee' ? DRIFTER_FLEE_TICKS : 0,
          wanderAngle: this.rng.next() * Math.PI * 2,
          wanderChangeTicks: 90,
          createdTick: -1,
        });
      }
    }

    // Initialize charms
    if (scenario?.charms !== undefined) {
      for (let i = 0; i < scenario.charms.length; i++) {
        const c = scenario.charms[i];
        this.charms.push({
          id: c.id ?? `C${i + 1}`,
          x: c.pos[0],
          y: c.pos[1],
          z: c.pos[2],
          available: c.available ?? true,
          respawnTicks: c.respawn_s !== undefined ? Math.round(c.respawn_s * TICK_RATE) : 0,
        });
      }
    } else {
      for (const c of this.map.charms) {
        this.charms.push({
          id: c.id,
          x: c.pos[0],
          y: c.pos[1],
          z: c.pos[2],
          available: true,
          respawnTicks: 0,
        });
      }
    }
  }

  getPlayerCapacity(): number {
    return Math.min(
      this.tuning.capacity_max,
      this.tuning.carry_capacity + 2 * this.player.successfulLights,
    );
  }

  private allocMoteId(): string {
    while (this.usedMoteIds.has(`M${this.moteSeq}`)) {
      this.moteSeq++;
    }
    const id = `M${this.moteSeq++}`;
    this.usedMoteIds.add(id);
    return id;
  }

  private allocShadeId(): string {
    while (this.usedShadeIds.has(`S${this.shadeSeq}`)) {
      this.shadeSeq++;
    }
    const id = `S${this.shadeSeq++}`;
    this.usedShadeIds.add(id);
    return id;
  }

  private allocDrifterId(): string {
    while (this.usedDrifterIds.has(`D${this.drifterSeq}`)) {
      this.drifterSeq++;
    }
    const id = `D${this.drifterSeq++}`;
    this.usedDrifterIds.add(id);
    return id;
  }

  private savePrevInput(input: InputState): void {
    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
      pause: input.pause,
    };
  }

  private hasSafeZone(lantern: LanternEntity): boolean {
    return lantern.lit && lantern.fuel60 >= LOW_FUEL_THRESHOLD_60;
  }

  /**
   * Executes 1 fixed 1/60s step following TICKET-02 + TICKET-03 mandatory tick order.
   */
  step(input: InputState): EventRecord[] {
    if (this.state === 'won' || this.state === 'lost') {
      return [];
    }

    const events: EventRecord[] = [];
    const emit = (name: EventName, data: Record<string, unknown>) => {
      events.push({ type: 'event', tick: this.tick, name, data });
    };

    this.tick += 1;

    // ------------------------------------------------------------------
    // Step 1: Read input (pause first)
    // ------------------------------------------------------------------
    const pausePressed = input.pause && !this.prevInput.pause;
    if (this.state === 'playing' && pausePressed) {
      this.state = 'paused';
      emit('paused', {});
      this.savePrevInput(input);
      return events;
    }
    if (this.state === 'paused') {
      if (pausePressed) {
        this.state = 'playing';
        emit('resumed', {});
      } else {
        this.savePrevInput(input);
        return events;
      }
    }

    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;
    const dashPressed = input.dash && !this.prevInput.dash;

    // ------------------------------------------------------------------
    // Step 2: Decrement timers + lantern fuel decay & shade drain
    // ------------------------------------------------------------------
    this.simTick += 1;
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / TICK_RATE);

    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.dashCdTicks > 0) this.player.dashCdTicks -= 1;
    if (this.player.pulseCdTicks > 0) this.player.pulseCdTicks -= 1;
    if (this.player.charmTicks > 0) this.player.charmTicks -= 1;

    let respawnNow = false;
    if (this.player.respawnWaitTicks > 0) {
      this.player.respawnWaitTicks -= 1;
      if (this.player.respawnWaitTicks === 0) {
        respawnNow = true;
      }
    }

    // Dropped motes TTL
    if (this.motes.length > 0) {
      const surviving: MoteEntity[] = [];
      for (const m of this.motes) {
        if (m.kind === 'dropped' && m.ttlTicks !== null) {
          m.ttlTicks -= 1;
          if (m.ttlTicks <= 0) continue;
        }
        surviving.push(m);
      }
      this.motes = surviving;
    }

    // Charm respawn timers
    for (const c of this.charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks -= 1;
        if (c.respawnTicks <= 0) {
          c.respawnTicks = 0;
          c.available = true;
        }
      }
    }

    // Shade state timers
    for (const s of this.shades) {
      if (s.stateTicksLeft > 0) {
        s.stateTicksLeft -= 1;
        if (s.stateTicksLeft === 0) {
          if (s.state === 'spawning' || s.state === 'stunned' || s.state === 'recoil') {
            s.state = 'wander';
          }
        }
      }
    }

    // Lantern natural fuel decay (1/60 per tick)
    for (const l of this.lanterns) {
      if (l.lit) {
        l.fuel60 -= FUEL_DECAY_PER_TICK_60;
      }
    }

    // Shade fuel draining (5/60 per tick per draining shade, cumulative)
    for (const s of this.shades) {
      if (s.state !== 'drain' || s.createdTick >= this.simTick) continue;
      let target = s.targetLanternId
        ? this.lanterns.find((l) => l.id === s.targetLanternId)
        : undefined;
      if (!target) {
        target = this.lanterns.find(
          (l) =>
            l.lit &&
            l.fuel60 < LOW_FUEL_THRESHOLD_60 &&
            distXZ(s.x, s.z, l.x, l.z) <= SHADE_DRAIN_RADIUS + DIST_EPS,
        );
        if (target) s.targetLanternId = target.id;
      }
      if (target && target.lit && distXZ(s.x, s.z, target.x, target.z) <= SHADE_DRAIN_RADIUS + DIST_EPS) {
        target.fuel60 -= FUEL_DRAIN_PER_TICK_60;
        s.drainTicks += 1;
        if (s.drainTicks % TICK_RATE === 0) {
          emit('fuel_drain', {
            lantern_id: target.id,
            shade_id: s.id,
            fuel: round1(Math.max(0, target.fuel60) / TICK_RATE),
          });
        }
      }
    }

    // Step 2b: Lanterns with fuel <= 0 go out immediately
    for (const l of this.lanterns) {
      if (l.lit && l.fuel60 <= 0) {
        l.lit = false;
        l.fuel60 = 0;
        l.deposited = 0;
        l.everLit = true;
        emit('lantern_out', { lantern_id: l.id });
      }
    }

    // Wind cycle on Night 3
    if (this.windEnabled) {
      const mod = this.simTick % WIND_INTERVAL_TICKS;
      if (this.simTick > 0 && mod === 0) {
        this.wind.active = true;
        this.wind.warning = false;
        this.wind.dir_deg = round3(this.rng.next() * 360);
        this.wind.ticksLeft = WIND_DURATION_TICKS;
      } else if (this.wind.active) {
        this.wind.ticksLeft -= 1;
        if (this.wind.ticksLeft <= 0) {
          this.wind.active = false;
          this.wind.ticksLeft = 0;
        }
      }
      this.wind.warning =
        !this.wind.active && mod >= WIND_INTERVAL_TICKS - WIND_WARNING_TICKS && this.simTick > 0;
    } else {
      this.wind.active = false;
      this.wind.warning = false;
    }

    // ------------------------------------------------------------------
    // Step 3: Player movement (jump, dash, jump pads, wind) & fall check
    // ------------------------------------------------------------------
    if (respawnNow) {
      this.player.x = this.map.spawnPos[0];
      this.player.y = this.map.spawnPos[1];
      this.player.z = this.map.spawnPos[2];
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.vz = 0;
      this.player.grounded = true;
      this.player.padLaunched = false;
      this.player.dashTimerTicks = 0;
      this.player.invulnTicks = INVULN_TICKS;
    } else if (this.player.respawnWaitTicks === 0) {
      let mx = Math.max(-1, Math.min(1, input.move[0]));
      let mz = Math.max(-1, Math.min(1, input.move[1]));
      const mlen = Math.hypot(mx, mz);
      if (mlen > 1) {
        mx /= mlen;
        mz /= mlen;
      }
      const theta = (input.cam_yaw_deg * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const wx = mx * cosT + mz * sinT;
      const wz = -mx * sinT + mz * cosT;
      const hasMove = mlen > 1e-6;
      if (hasMove) {
        this.player.facingYaw = Math.atan2(wx, wz);
      }

      if (
        dashPressed &&
        this.player.dashTimerTicks <= 0 &&
        (this.player.dashCdTicks <= 0 || this.player.charmTicks > 0)
      ) {
        this.player.dashTimerTicks = DASH_TICKS;
        this.player.dashCdTicks = this.player.charmTicks > 0 ? 0 : DASH_CD_TICKS;
        if (hasMove) {
          const wLen = Math.hypot(wx, wz) || 1;
          this.player.dashDirX = wx / wLen;
          this.player.dashDirZ = wz / wLen;
        } else {
          this.player.dashDirX = Math.sin(this.player.facingYaw);
          this.player.dashDirZ = Math.cos(this.player.facingYaw);
        }
        this.player.padLaunched = false;
        this.player.vy = 0;
        emit('dash', {});
      }

      const windRad = (this.wind.dir_deg * Math.PI) / 180;
      const windVx = this.wind.active ? Math.cos(windRad) * WIND_PUSH_SPEED : 0;
      const windVz = this.wind.active ? Math.sin(windRad) * WIND_PUSH_SPEED : 0;

      if (this.player.dashTimerTicks > 0) {
        this.player.vx = this.player.dashDirX * this.tuning.dash_speed + windVx;
        this.player.vz = this.player.dashDirZ * this.tuning.dash_speed + windVz;
        this.player.vy = 0;
        this.player.dashTimerTicks -= 1;
      } else {
        if (!this.player.padLaunched) {
          const maxSpeed =
            this.player.charmTicks > 0 ? CHARM_SPEED : this.tuning.player_speed;
          const targetVx = wx * maxSpeed;
          const targetVz = wz * maxSpeed;
          const maxDelta = (maxSpeed / ACCEL_TIME_S) * DT;

          const dvx = targetVx - this.player.vx;
          const dvz = targetVz - this.player.vz;
          const dv = Math.hypot(dvx, dvz);
          if (dv <= maxDelta) {
            this.player.vx = targetVx;
            this.player.vz = targetVz;
          } else if (dv > 1e-6) {
            this.player.vx += (dvx / dv) * maxDelta;
            this.player.vz += (dvz / dv) * maxDelta;
          }
        }

        if (jumpPressed && this.player.grounded) {
          this.player.vy = JUMP_VELOCITY;
          this.player.grounded = false;
        }

        if (!this.player.grounded) {
          this.player.vy -= GRAVITY * DT;
        }
      }

      const stepVx =
        this.player.dashTimerTicks > 0 ? this.player.vx : this.player.vx + windVx;
      const stepVz =
        this.player.dashTimerTicks > 0 ? this.player.vz : this.player.vz + windVz;
      const nextX = this.player.x + stepVx * DT;
      const nextZ = this.player.z + stepVz * DT;
      const resolved = resolveHorizontalMove(
        this.night,
        this.player.x,
        this.player.z,
        nextX,
        nextZ,
        this.player.y,
      );
      this.player.x = resolved.x;
      this.player.z = resolved.z;

      const prevY = this.player.y;
      const nextY = this.player.y + this.player.vy * DT;
      const surfaceY = getTopSurfaceY(this.night, this.player.x, this.player.z);

      if (this.player.dashTimerTicks > 0) {
        if (surfaceY !== null && this.player.grounded && Math.abs(surfaceY - prevY) <= 0.65) {
          this.player.y = surfaceY;
          this.player.grounded = true;
        } else {
          this.player.y = prevY;
          this.player.grounded = surfaceY !== null && Math.abs(this.player.y - surfaceY) <= 0.05;
        }
      } else if (
        surfaceY !== null &&
        this.player.vy <= 0 &&
        prevY >= surfaceY - 0.65 &&
        nextY <= surfaceY + 0.05
      ) {
        this.player.y = surfaceY;
        this.player.vy = 0;
        this.player.grounded = true;
        this.player.padLaunched = false;
      } else if (
        surfaceY !== null &&
        this.player.grounded &&
        Math.abs(surfaceY - prevY) <= 0.65
      ) {
        this.player.y = surfaceY;
        this.player.vy = 0;
        this.player.grounded = true;
      } else {
        this.player.y = nextY;
        this.player.grounded = false;
      }

      // Jump pads
      for (const pad of this.map.jumpPads) {
        if (
          distXZ(this.player.x, this.player.z, pad.x, pad.z) <= pad.radius + DIST_EPS &&
          Math.abs(this.player.y - pad.y) <= 0.6 &&
          !this.player.padLaunched
        ) {
          this.player.vx = pad.vx;
          this.player.vy = pad.vy;
          this.player.vz = pad.vz;
          this.player.grounded = false;
          this.player.padLaunched = true;
          this.player.dashTimerTicks = 0;
          break;
        }
      }

      // Fall check (Y < -10)
      if (this.tuning.fall_enabled && this.player.y < FALL_Y_THRESHOLD) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const lost = this.player.carried;
        this.player.carried = 0;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.vz = 0;
        this.player.dashTimerTicks = 0;
        this.player.padLaunched = false;
        emit('player_hit', {
          by: 'fall',
          flames: this.player.flames,
          dropped: 0,
          lost,
        });
        if (this.player.flames > 0) {
          this.player.respawnWaitTicks = FALL_RESPAWN_WAIT_TICKS;
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Pickup motes (up to dynamic capacity) and charms
    // ------------------------------------------------------------------
    if (this.player.respawnWaitTicks === 0 && this.player.flames > 0) {
      const capacity = this.getPlayerCapacity();
      if (this.player.carried < capacity && this.motes.length > 0) {
        const remaining: MoteEntity[] = [];
        for (const mote of this.motes) {
          const canPick =
            this.player.carried < capacity &&
            mote.createdTick < this.simTick &&
            distXZ(this.player.x, this.player.z, mote.x, mote.z) <=
              this.tuning.pickup_radius + DIST_EPS &&
            Math.abs(this.player.y - mote.y) <= PICKUP_MAX_DY + DIST_EPS;
          if (canPick) {
            this.player.carried += 1;
            emit('mote_picked', { carried: this.player.carried });
          } else {
            remaining.push(mote);
          }
        }
        this.motes = remaining;
      }

      for (const charm of this.charms) {
        if (
          charm.available &&
          distXZ(this.player.x, this.player.z, charm.x, charm.z) <=
            this.tuning.pickup_radius + DIST_EPS &&
          Math.abs(this.player.y - charm.y) <= PICKUP_MAX_DY + DIST_EPS
        ) {
          charm.available = false;
          charm.respawnTicks = CHARM_RESPAWN_TICKS;
          this.player.charmTicks = CHARM_DURATION_TICKS;
          this.player.dashCdTicks = 0;
          emit('charm_picked', {
            charm_id: charm.id,
            charm_ticks: CHARM_DURATION_TICKS,
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 5: Lantern interaction (light, relight, or refuel)
    // ------------------------------------------------------------------
    const newlySafeLanterns: LanternEntity[] = [];
    if (
      interactPressed &&
      this.player.respawnWaitTicks === 0 &&
      this.player.flames > 0 &&
      this.player.carried > 0
    ) {
      let bestLantern: LanternEntity | null = null;
      let bestDist = Infinity;

      for (const lantern of this.lanterns) {
        // Eligible: unlit OR lit with fuel < 100
        const canReceive = !lantern.lit || lantern.fuel60 < FUEL_MAX_60;
        if (!canReceive) continue;
        const d = distXZ(this.player.x, this.player.z, lantern.x, lantern.z);
        if (d <= this.tuning.interact_radius + DIST_EPS && Math.abs(this.player.y - lantern.y) <= 2.5) {
          if (
            d < bestDist - 1e-9 ||
            (Math.abs(d - bestDist) <= 1e-9 && bestLantern && lantern.id < bestLantern.id)
          ) {
            bestDist = d;
            bestLantern = lantern;
          }
        }
      }

      if (bestLantern) {
        if (!bestLantern.lit) {
          const cost = bestLantern.everLit ? this.tuning.relight_cost : this.tuning.lantern_cost;
          const needed = Math.max(0, cost - bestLantern.deposited);
          const amount = Math.min(this.player.carried, needed);
          if (amount > 0) {
            this.player.carried -= amount;
            bestLantern.deposited += amount;
            this.score += amount * this.tuning.score.per_mote;
            emit('deposit', {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited,
            });

            if (bestLantern.deposited >= cost) {
              const isRelight = bestLantern.everLit;
              bestLantern.lit = true;
              bestLantern.fuel60 = FUEL_MAX_60;
              bestLantern.everLit = true;
              if (isRelight) {
                bestLantern.relitCount += 1;
              }
              this.player.successfulLights += 1;
              this.score += isRelight ? SCORE_RELIGHT : this.tuning.score.per_lantern;
              newlySafeLanterns.push(bestLantern);
              emit('lantern_lit', {
                lantern_id: bestLantern.id,
                relight: isRelight,
              });
            }
          }
        } else {
          // Refuel lit lantern (integer 1/60 math -> zero float drift)
          const deficit60 = FUEL_MAX_60 - bestLantern.fuel60;
          const used = Math.min(this.player.carried, Math.ceil(deficit60 / FUEL_PER_MOTE_60));
          if (used > 0) {
            const wasLow = bestLantern.fuel60 < LOW_FUEL_THRESHOLD_60;
            this.player.carried -= used;
            bestLantern.fuel60 = Math.min(FUEL_MAX_60, bestLantern.fuel60 + used * FUEL_PER_MOTE_60);
            this.score += used * this.tuning.score.per_mote;
            emit('refuel', {
              lantern_id: bestLantern.id,
              amount: used,
              fuel: round1(bestLantern.fuel60 / TICK_RATE),
            });
            if (wasLow && bestLantern.fuel60 >= LOW_FUEL_THRESHOLD_60) {
              newlySafeLanterns.push(bestLantern);
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 6: Update safe zones (only lit lanterns with fuel >= 30)
    // ------------------------------------------------------------------
    for (const lantern of newlySafeLanterns) {
      for (const shade of this.shades) {
        if (distXZ(shade.x, shade.z, lantern.x, lantern.z) < this.tuning.safe_radius) {
          shade.safePushTicks = SAFE_PUSH_MAX_TICKS;
          shade.safePushLanternId = lantern.id;
          if (shade.state === 'drain') {
            shade.state = 'wander';
            shade.targetLanternId = null;
            shade.drainTicks = 0;
          }
        }
      }
    }

    for (const shade of this.shades) {
      if (shade.safePushTicks > 0 && shade.safePushLanternId) {
        const lantern = this.lanterns.find((l) => l.id === shade.safePushLanternId);
        if (lantern && this.hasSafeZone(lantern)) {
          const dx = shade.x - lantern.x;
          const dz = shade.z - lantern.z;
          const d = Math.hypot(dx, dz);
          const remaining = Math.max(0, this.tuning.safe_radius + 0.05 - d);
          const stepPush = Math.min(remaining, this.tuning.safe_radius / SAFE_PUSH_MAX_TICKS + 0.25);
          if (remaining > 0.001) {
            const nx = d > 1e-6 ? dx / d : 1;
            const nz = d > 1e-6 ? dz / d : 0;
            shade.x += nx * stepPush;
            shade.z += nz * stepPush;
          }
          shade.safePushTicks -= 1;
          if (distXZ(shade.x, shade.z, lantern.x, lantern.z) >= this.tuning.safe_radius) {
            shade.safePushTicks = 0;
            shade.safePushLanternId = null;
          }
        } else {
          shade.safePushTicks = 0;
          shade.safePushLanternId = null;
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 7: Light Pulse (3D radius <= 5m from player feet + 0.8m)
    // ------------------------------------------------------------------
    if (
      pulsePressed &&
      this.player.respawnWaitTicks === 0 &&
      this.player.flames > 0 &&
      this.player.pulseCdTicks <= 0 &&
      this.player.carried >= this.tuning.pulse_cost
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCdTicks = PULSE_CD_TICKS;
      const stunnedIds: string[] = [];

      const pulseX = this.player.x;
      const pulseY = this.player.y + PULSE_CENTER_Y_OFFSET;
      const pulseZ = this.player.z;

      for (const shade of this.shades) {
        if (shade.createdTick >= this.simTick) continue;
        const d3 = dist3D(
          pulseX,
          pulseY,
          pulseZ,
          shade.x,
          shade.y + SHADE_CENTER_Y_OFFSET,
          shade.z,
        );
        if (d3 <= this.tuning.pulse_radius + DIST_EPS) {
          const wasDraining = shade.state === 'drain';
          shade.state = 'stunned';
          shade.stateTicksLeft = PULSE_STUN_TICKS;
          shade.pushTicksLeft = PULSE_PUSH_TICKS;
          shade.targetLanternId = null;
          shade.drainTicks = 0;
          const dx = shade.x - this.player.x;
          const dz = shade.z - this.player.z;
          const dXZ = Math.hypot(dx, dz);
          if (dXZ > 1e-6) {
            shade.pushDirX = dx / dXZ;
            shade.pushDirZ = dz / dXZ;
          } else {
            shade.pushDirX = 1;
            shade.pushDirZ = 0;
          }
          this.score += wasDraining ? SCORE_STUN_DRAINING : this.tuning.score.per_stun;
          stunnedIds.push(shade.id);
        }
      }

      for (const drifter of this.drifters) {
        if (drifter.state === 'removed' || drifter.createdTick >= this.simTick) continue;
        const d3 = dist3D(pulseX, pulseY, pulseZ, drifter.x, drifter.y + 0.8, drifter.z);
        if (d3 <= this.tuning.pulse_radius + DIST_EPS) {
          if (drifter.state === 'chase') {
            drifter.state = 'flee';
            drifter.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          } else if (drifter.state === 'flee' && drifter.stolen > 0) {
            const amount = drifter.stolen;
            drifter.stolen = 0;
            drifter.fleeTicksLeft = DRIFTER_PULSE_DROP_FLEE_TICKS;
            this.spawnDroppedMotesAt(drifter.x, drifter.y, drifter.z, amount, 0.4, 1.0);
            emit('drifter_drop', { drifter_id: drifter.id, amount });
          }
        }
      }

      emit('pulse', { stunned_ids: stunnedIds });
    }

    // ------------------------------------------------------------------
    // Step 8: Move Shades (including drain logic) and Drifters
    // ------------------------------------------------------------------
    for (const shade of this.shades) {
      if (shade.createdTick >= this.simTick) continue;

      if (shade.state === 'spawning') {
        continue;
      }

      if (shade.state === 'stunned') {
        if (shade.pushTicksLeft > 0) {
          const stepDist = this.tuning.pulse_push_m / PULSE_PUSH_TICKS;
          const nx = shade.x + shade.pushDirX * stepDist;
          const nz = shade.z + shade.pushDirZ * stepDist;
          const surf = getTopSurfaceY(this.night, nx, nz);
          const res = resolveHorizontalMove(this.night, shade.x, shade.z, nx, nz, shade.y);
          if (surf !== null && !res.blocked) {
            shade.x = res.x;
            shade.z = res.z;
            shade.y = surf;
          } else {
            shade.pushTicksLeft = 0;
          }
          if (shade.pushTicksLeft > 0) shade.pushTicksLeft -= 1;
        }
        continue;
      }

      if (shade.state === 'recoil') {
        const stepDist = SHADE_RECOIL_DIST / SHADE_RECOIL_TICKS;
        const nx = shade.x + shade.recoilDirX * stepDist;
        const nz = shade.z + shade.recoilDirZ * stepDist;
        const res = resolveHorizontalMove(this.night, shade.x, shade.z, nx, nz, shade.y);
        const surf = getTopSurfaceY(this.night, res.x, res.z);
        if (surf !== null && surf <= shade.y + 0.65) {
          shade.x = res.x;
          shade.z = res.z;
          shade.y = surf;
        }
        continue;
      }

      const distToPlayer = distXZ(shade.x, shade.z, this.player.x, this.player.z);

      if (shade.state === 'drain') {
        const target = shade.targetLanternId
          ? this.lanterns.find((l) => l.id === shade.targetLanternId)
          : undefined;
        if (distToPlayer <= SHADE_DRAIN_PLAYER_AGGRO_RADIUS + DIST_EPS) {
          shade.state = 'chase';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else if (
          !target ||
          !target.lit ||
          target.fuel60 >= LOW_FUEL_THRESHOLD_60 ||
          distXZ(shade.x, shade.z, target.x, target.z) > SHADE_DRAIN_RADIUS + DIST_EPS
        ) {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else {
          // Stay still while draining
          continue;
        }
      }

      // Detection / lose-aggro hysteresis
      if (shade.state === 'wander' && distToPlayer <= SHADE_DETECT_RADIUS + DIST_EPS) {
        shade.state = 'chase';
        shade.targetLanternId = null;
      } else if (shade.state === 'chase' && distToPlayer > SHADE_LOSE_RADIUS) {
        shade.state = 'wander';
      }

      let moveX = 0;
      let moveZ = 0;
      if (shade.state === 'chase') {
        const dx = this.player.x - shade.x;
        const dz = this.player.z - shade.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          const stepDist = Math.min(d, this.map.shadeSpeed * DT);
          moveX = (dx / d) * stepDist;
          moveZ = (dz / d) * stepDist;
        }
      } else {
        // wander: prioritize nearest weak lit lantern (fuel < 30), else nearest unlit lantern
        let weakTarget: LanternEntity | null = null;
        let weakDist = Infinity;
        for (const l of this.lanterns) {
          if (l.lit && l.fuel60 < LOW_FUEL_THRESHOLD_60) {
            const d = distXZ(shade.x, shade.z, l.x, l.z);
            if (
              d < weakDist - 1e-9 ||
              (Math.abs(d - weakDist) <= 1e-9 && weakTarget && l.id < weakTarget.id)
            ) {
              weakDist = d;
              weakTarget = l;
            }
          }
        }

        if (weakTarget) {
          if (weakDist <= SHADE_DRAIN_RADIUS + DIST_EPS) {
            shade.state = 'drain';
            shade.targetLanternId = weakTarget.id;
            shade.drainTicks = 0;
            continue;
          }
          const dx = weakTarget.x - shade.x;
          const dz = weakTarget.z - shade.z;
          const stepDist = Math.min(weakDist, this.map.shadeSpeed * DT);
          moveX = (dx / weakDist) * stepDist;
          moveZ = (dz / weakDist) * stepDist;
        } else {
          // Move toward nearest unlit lantern or wander
          let unlitTarget: LanternEntity | null = null;
          let unlitDist = Infinity;
          for (const l of this.lanterns) {
            if (!l.lit) {
              const d = distXZ(shade.x, shade.z, l.x, l.z);
              if (
                d < unlitDist - 1e-9 ||
                (Math.abs(d - unlitDist) <= 1e-9 && unlitTarget && l.id < unlitTarget.id)
              ) {
                unlitDist = d;
                unlitTarget = l;
              }
            }
          }
          if (unlitTarget && unlitDist > 2.5) {
            const dx = unlitTarget.x - shade.x;
            const dz = unlitTarget.z - shade.z;
            const stepDist = Math.min(unlitDist, SHADE_WANDER_SPEED * DT);
            moveX = (dx / unlitDist) * stepDist;
            moveZ = (dz / unlitDist) * stepDist;
          } else {
            shade.wanderChangeTicks -= 1;
            if (shade.wanderChangeTicks <= 0) {
              shade.wanderAngle = this.rng.next() * Math.PI * 2;
              shade.wanderChangeTicks = 60 + Math.floor(this.rng.next() * 90);
            }
            moveX = Math.cos(shade.wanderAngle) * SHADE_WANDER_SPEED * DT;
            moveZ = Math.sin(shade.wanderAngle) * SHADE_WANDER_SPEED * DT;
          }
        }
      }

      let candX = shade.x + moveX;
      let candZ = shade.z + moveZ;

      // Enforce safe_radius ONLY for lit lanterns with fuel >= 30
      if (shade.safePushTicks === 0) {
        for (const lantern of this.lanterns) {
          if (!this.hasSafeZone(lantern)) continue;
          const ldx = candX - lantern.x;
          const ldz = candZ - lantern.z;
          const ld = Math.hypot(ldx, ldz);
          if (ld < this.tuning.safe_radius) {
            const pushR = this.tuning.safe_radius + 0.01;
            if (ld > 1e-6) {
              candX = lantern.x + (ldx / ld) * pushR;
              candZ = lantern.z + (ldz / ld) * pushR;
            } else {
              candX = lantern.x + pushR;
            }
          }
        }
      }

      const res = resolveHorizontalMove(this.night, shade.x, shade.z, candX, candZ, shade.y);
      const surf = getTopSurfaceY(this.night, res.x, res.z);
      if (surf !== null && surf <= shade.y + 0.65) {
        shade.x = res.x;
        shade.z = res.z;
        shade.y = surf;
      } else if (shade.state === 'wander') {
        shade.wanderAngle += Math.PI * 0.75;
      }
      if (res.blocked && shade.state === 'wander') {
        shade.wanderAngle += Math.PI * 0.5;
      }

      // If wandering toward a weak lantern and just entered <= 2m, transition to drain
      if (shade.state === 'wander') {
        for (const l of this.lanterns) {
          if (
            l.lit &&
            l.fuel60 < LOW_FUEL_THRESHOLD_60 &&
            distXZ(shade.x, shade.z, l.x, l.z) <= SHADE_DRAIN_RADIUS + DIST_EPS
          ) {
            shade.state = 'drain';
            shade.targetLanternId = l.id;
            shade.drainTicks = 0;
            break;
          }
        }
      }
    }

    // Move Drifters
    for (const drifter of this.drifters) {
      if (drifter.state === 'removed' || drifter.createdTick >= this.simTick) continue;

      const dPlayer = distXZ(drifter.x, drifter.z, this.player.x, this.player.z);
      if (drifter.state === 'idle') {
        if (
          !drifter.hasStolen &&
          this.player.carried >= DRIFTER_MIN_CARRIED &&
          dPlayer <= DRIFTER_DETECT_RADIUS + DIST_EPS
        ) {
          drifter.state = 'chase';
        }
      } else if (drifter.state === 'chase') {
        if (
          this.player.carried < DRIFTER_MIN_CARRIED ||
          dPlayer > DRIFTER_DETECT_RADIUS + DIST_EPS
        ) {
          drifter.state = 'idle';
        }
      }

      if (drifter.state === 'idle') {
        drifter.wanderChangeTicks -= 1;
        if (drifter.wanderChangeTicks <= 0) {
          drifter.wanderAngle = this.rng.next() * Math.PI * 2;
          drifter.wanderChangeTicks = 90;
        }
        drifter.x += Math.cos(drifter.wanderAngle) * DRIFTER_IDLE_SPEED * DT;
        drifter.z += Math.sin(drifter.wanderAngle) * DRIFTER_IDLE_SPEED * DT;
      } else if (drifter.state === 'chase') {
        const dx = this.player.x - drifter.x;
        const dz = this.player.z - drifter.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          const stepDist = Math.min(d, DRIFTER_SPEED * DT);
          drifter.x += (dx / d) * stepDist;
          drifter.z += (dz / d) * stepDist;
        }
        drifter.y = this.player.y;
      } else if (drifter.state === 'flee') {
        const dx = drifter.x - this.player.x;
        const dz = drifter.z - this.player.z;
        const d = Math.hypot(dx, dz);
        const dirX = d > 1e-6 ? dx / d : 1;
        const dirZ = d > 1e-6 ? dz / d : 0;
        drifter.x += dirX * DRIFTER_SPEED * DT;
        drifter.z += dirZ * DRIFTER_SPEED * DT;
        drifter.fleeTicksLeft -= 1;
        if (drifter.fleeTicksLeft <= 0) {
          drifter.state = 'removed';
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 9: Contacts — Drifters steal first, then Shades hit (ascending id)
    // ------------------------------------------------------------------
    if (this.player.respawnWaitTicks === 0 && this.player.flames > 0) {
      const sortedDrifters = [...this.drifters].sort((a, b) => a.id.localeCompare(b.id));
      for (const drifter of sortedDrifters) {
        if (
          drifter.state === 'chase' &&
          !drifter.hasStolen &&
          drifter.createdTick < this.simTick &&
          distXZ(drifter.x, drifter.z, this.player.x, this.player.z) <=
            DRIFTER_STEAL_RADIUS + DIST_EPS
        ) {
          const amount = Math.min(DRIFTER_MAX_STEAL, this.player.carried);
          this.player.carried -= amount;
          drifter.stolen = amount;
          drifter.hasStolen = true;
          drifter.state = 'flee';
          drifter.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          emit('drifter_steal', {
            drifter_id: drifter.id,
            amount,
            carried: this.player.carried,
          });
        }
      }

      if (this.player.invulnTicks <= 0) {
        const sortedShades = [...this.shades].sort((a, b) => a.id.localeCompare(b.id));
        for (const shade of sortedShades) {
          if (shade.createdTick >= this.simTick) continue;
          if (shade.safePushTicks > 0) continue;
          if (shade.state !== 'chase' && shade.state !== 'wander') continue;

          if (
            distXZ(this.player.x, this.player.z, shade.x, shade.z) <=
              this.tuning.shade_hit_radius + DIST_EPS &&
            Math.abs(this.player.y - shade.y) <= SHADE_HIT_MAX_DY + DIST_EPS
          ) {
            this.player.flames = Math.max(0, this.player.flames - 1);
            this.player.invulnTicks = INVULN_TICKS;

            const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
            this.player.carried -= dropped;
            if (dropped > 0) {
              this.spawnDroppedMotesAt(this.player.x, this.player.y, this.player.z, dropped, 1.5, 2.5);
            }

            const rdx = shade.x - this.player.x;
            const rdz = shade.z - this.player.z;
            const rd = Math.hypot(rdx, rdz);
            shade.state = 'recoil';
            shade.stateTicksLeft = SHADE_RECOIL_TICKS;
            shade.recoilDirX = rd > 1e-6 ? rdx / rd : 1;
            shade.recoilDirZ = rd > 1e-6 ? rdz / rd : 0;

            emit('player_hit', {
              by: 'shade',
              flames: this.player.flames,
              dropped,
            });
            break;
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 10: Scheduled spawns (active next tick)
    // ------------------------------------------------------------------
    if (
      this.randomMotes &&
      this.simTick > 0 &&
      this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0 &&
      this.motes.length < MAX_MOTES
    ) {
      const emptyPoints = this.map.moteSpawnPoints.filter(
        (pt) => !this.motes.some((m) => distXZ(m.x, m.z, pt[0], pt[2]) <= 0.5),
      );
      if (emptyPoints.length > 0) {
        const chosen = emptyPoints[Math.floor(this.rng.next() * emptyPoints.length)];
        this.motes.push({
          id: this.allocMoteId(),
          x: chosen[0],
          y: chosen[1],
          z: chosen[2],
          kind: 'random',
          ttlTicks: null,
          createdTick: this.simTick,
        });
      }
    }

    if (this.randomShades && this.simTick >= SHADE_FIRST_SPAWN_TICK) {
      const isFirst = this.simTick === SHADE_FIRST_SPAWN_TICK;
      const isPeriodic =
        this.simTick > SHADE_FIRST_SPAWN_TICK &&
        (this.simTick - SHADE_FIRST_SPAWN_TICK) % this.map.shadeSpawnIntervalTicks === 0;
      const toSpawn = isFirst ? 2 : isPeriodic ? 1 : 0;

      for (let i = 0; i < toSpawn; i++) {
        if (this.shades.length >= this.map.shadeMaxActive) break;
        const validPts = this.map.shadeSpawnPoints.filter((pt) => {
          const farFromPlayer =
            distXZ(pt[0], pt[2], this.player.x, this.player.z) >= SHADE_MIN_SPAWN_DIST;
          const outsideSafe = !this.lanterns.some(
            (l) => this.hasSafeZone(l) && distXZ(pt[0], pt[2], l.x, l.z) < this.tuning.safe_radius,
          );
          return farFromPlayer && outsideSafe;
        });
        if (validPts.length === 0) break;
        const pt = validPts[Math.floor(this.rng.next() * validPts.length)];
        const id = this.allocShadeId();
        this.shades.push({
          id,
          x: pt[0],
          y: pt[1],
          z: pt[2],
          state: 'spawning',
          stateTicksLeft: SHADE_SPAWNING_TICKS,
          pushTicksLeft: 0,
          pushDirX: 1,
          pushDirZ: 0,
          recoilDirX: 1,
          recoilDirZ: 0,
          safePushTicks: 0,
          safePushLanternId: null,
          targetLanternId: null,
          drainTicks: 0,
          wanderAngle: this.rng.next() * Math.PI * 2,
          wanderChangeTicks: 60,
          createdTick: this.simTick,
        });
        emit('shade_spawned', { id });
      }
    }

    if (
      this.randomDrifters &&
      this.simTick > 0 &&
      this.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0
    ) {
      const activeDrifters = this.drifters.filter((d) => d.state !== 'removed').length;
      if (activeDrifters < DRIFTER_MAX_ACTIVE && this.map.shadeSpawnPoints.length > 0) {
        const pt =
          this.map.shadeSpawnPoints[Math.floor(this.rng.next() * this.map.shadeSpawnPoints.length)];
        this.drifters.push({
          id: this.allocDrifterId(),
          x: pt[0],
          y: pt[1],
          z: pt[2],
          state: 'idle',
          stolen: 0,
          hasStolen: false,
          fleeTicksLeft: 0,
          wanderAngle: this.rng.next() * Math.PI * 2,
          wanderChangeTicks: 90,
          createdTick: this.simTick,
        });
      }
    }

    // ------------------------------------------------------------------
    // Step 11: Win / Lose check (TICKET-03 dawn survival rule)
    // ------------------------------------------------------------------
    if (this.player.flames <= 0) {
      this.state = 'lost';
      emit('game_over', { result: 'lost', reason: 'no_flames' });
    } else if (this.timeLeftS <= 0) {
      const litLanterns = this.lanterns.filter((l) => l.lit);
      const threshold = Math.ceil(this.tuning.win_ratio * this.lanterns.length);
      if (litLanterns.length >= threshold) {
        let dawnBonus = this.player.flames * this.tuning.score.per_flame_left;
        for (const l of litLanterns) {
          dawnBonus += SCORE_DAWN_LANTERN_BASE + Math.floor(l.fuel60 / TICK_RATE);
        }
        this.score += dawnBonus;
        this.state = 'won';
        emit('game_over', { result: 'won', reason: 'dawn_survived' });
      } else {
        this.state = 'lost';
        emit('game_over', { result: 'lost', reason: 'dawn' });
      }
    }

    this.savePrevInput(input);
    return events;
  }

  private spawnDroppedMotesAt(
    cx: number,
    cy: number,
    cz: number,
    count: number,
    minR: number,
    maxR: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(minR, maxR);
      const x = round3(cx + Math.cos(angle) * r);
      const z = round3(cz + Math.sin(angle) * r);
      const surf = getTopSurfaceY(this.night, x, z);
      this.motes.push({
        id: this.allocMoteId(),
        x,
        y: surf !== null ? surf : cy,
        z,
        kind: 'dropped',
        ttlTicks: DROPPED_MOTE_TTL_TICKS,
        createdTick: this.simTick,
      });
    }
  }

  getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      wind: {
        active: this.wind.active,
        dir_deg: round3(this.wind.dir_deg),
      },
      player: {
        pos: [round3(this.player.x), round3(this.player.y), round3(this.player.z)],
        vel: [round3(this.player.vx), round3(this.player.vy), round3(this.player.vz)],
        grounded: this.player.grounded,
        invuln: this.player.invulnTicks > 0,
        flames: this.player.flames,
        carried: this.player.carried,
        capacity: this.getPlayerCapacity(),
        dash_cd_s: round3(this.player.dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(this.player.pulseCdTicks / TICK_RATE),
        charm_s: round3(this.player.charmTicks / TICK_RATE),
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: [round3(l.x), round3(l.y), round3(l.z)],
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? round1(l.fuel60 / TICK_RATE) : 0,
        ever_lit: l.everLit,
        relit_count: l.relitCount,
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: [round3(s.x), round3(s.y), round3(s.z)],
        state: s.state,
      })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: [round3(m.x), round3(m.y), round3(m.z)],
        kind: m.kind,
        ttl_s: m.ttlTicks !== null ? round3(m.ttlTicks / TICK_RATE) : null,
      })),
      drifters: this.drifters
        .filter((d) => d.state !== 'removed')
        .map((d) => ({
          id: d.id,
          pos: [round3(d.x), round3(d.y), round3(d.z)],
          state: d.state,
          stolen: d.stolen,
        })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
      })),
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.tick,
      state: this.state,
      score: this.score,
    };
  }
}

export interface HeadlessRunParams {
  seed: number;
  night: NightId;
  ticks: number;
  snapshotEvery: number;
  scenario?: ScenarioFile;
  frames?: InputFrame[];
}

export function runHeadlessSimulation(
  params: HeadlessRunParams,
): Array<SnapshotRecord | EventRecord | EndRecord> {
  const sim = new GameSimulation({
    seed: params.seed,
    night: params.night,
    scenario: params.scenario,
  });

  const records: Array<SnapshotRecord | EventRecord | EndRecord> = [];
  records.push(sim.getSnapshot());
  records.push({
    type: 'event',
    tick: 0,
    name: 'night_start',
    data: { night: params.night },
  });

  const frames = params.frames ?? [];
  let frameIdx = 0;
  const input: InputState = createDefaultInputState();
  const isGameOver = () => sim.state === 'won' || sim.state === 'lost';

  for (let k = 0; k < params.ticks; k++) {
    if (isGameOver()) {
      break;
    }

    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx++];
      if (f.move !== undefined) input.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) input.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) input.jump = f.jump;
      if (f.interact !== undefined) input.interact = f.interact;
      if (f.pulse !== undefined) input.pulse = f.pulse;
      if (f.dash !== undefined) input.dash = f.dash;
      if (f.pause !== undefined) input.pause = f.pause;
    }

    const events = sim.step(input);
    for (const ev of events) {
      records.push(ev);
    }

    if (sim.tick % params.snapshotEvery === 0) {
      records.push(sim.getSnapshot());
    }

    if (isGameOver()) {
      break;
    }
  }

  records.push(sim.getEndRecord());
  return records;
}

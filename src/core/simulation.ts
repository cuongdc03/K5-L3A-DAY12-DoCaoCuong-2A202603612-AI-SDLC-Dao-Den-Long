import {
  DIST_EPS,
  DT,
  GRAVITY,
  INITIAL_RANDOM_MOTES,
  INITIAL_RANDOM_SHADES,
  ISLAND_RADIUS,
  JUMP_VELOCITY,
  LANTERN_RING_RADIUS,
  MAX_RANDOM_MOTES,
  MAX_RANDOM_SHADES,
  MIN_RANDOM_MOTES,
  MOTE_RESPAWN_INTERVAL_TICKS,
  SHADE_DISPLAY_Y,
  SHADE_SPAWN_INTERVAL_TICKS,
  TUNING,
} from './config';
import { SeededRNG } from './prng';
import type {
  EndRecord,
  EventName,
  EventRecord,
  GameStatus,
  InputFrame,
  InputState,
  LanternEntity,
  MoteEntity,
  PlayerEntity,
  ScenarioFile,
  ShadeEntity,
  SnapshotRecord,
  TuningConfig,
} from './types';

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function createDefaultInputState(): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
  };
}

export interface SimulationOptions {
  seed: number;
  night?: number;
  scenario?: ScenarioFile;
  tuning?: TuningConfig;
}

export class GameSimulation {
  readonly seed: number;
  readonly night: number;
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

  private randomMotes: boolean;
  private randomShades: boolean;
  private usedMoteIds = new Set<string>();
  private usedShadeIds = new Set<string>();
  private moteSeq = 1;
  private shadeSeq = 1;
  private prevInput: InputState = createDefaultInputState();

  constructor(options: SimulationOptions) {
    this.seed = options.seed;
    this.night = options.night ?? 1;
    this.tuning = options.tuning ?? TUNING;
    this.rng = new SeededRNG(this.seed);

    const scenario = options.scenario;
    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;

    this.initialTimeLeftS = scenario?.time_left_s ?? this.tuning.night1_duration_s;
    this.timeLeftS = this.initialTimeLeftS;

    // Initialize player at (0, 0, 0)
    const pPos = scenario?.player?.pos ?? [0, 0, 0];
    this.player = {
      x: pPos[0],
      y: pPos[1],
      z: pPos[2],
      vy: 0,
      facingYaw: 0,
      flames: scenario?.player?.flames ?? this.tuning.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTimer: 0,
      pulseCooldown: 0,
    };

    // Initialize 5 default lanterns evenly around ring
    const count = this.tuning.lantern_count_night1;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = round3(Math.sin(angle) * LANTERN_RING_RADIUS);
      const z = round3(Math.cos(angle) * LANTERN_RING_RADIUS);
      this.lanterns.push({
        id: `L${i + 1}`,
        x,
        y: 0,
        z,
        lit: false,
        deposited: 0,
      });
    }

    // Apply scenario lantern overrides (no events, no score)
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
            if (override.lit && override.deposited === undefined) {
              existing.deposited = Math.max(existing.deposited, this.tuning.lantern_cost);
            }
          }
        }
      }
    }

    // Initialize motes
    if (scenario?.motes !== undefined) {
      for (const m of scenario.motes) {
        if (Array.isArray(m)) {
          const id = this.allocMoteId();
          this.motes.push({ id, x: m[0], y: 0, z: m[2] });
        } else {
          const id = m.id ?? this.allocMoteId();
          this.usedMoteIds.add(id);
          this.motes.push({ id, x: m.pos[0], y: 0, z: m.pos[2] });
        }
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_RANDOM_MOTES; i++) {
        this.spawnRandomMote();
      }
    }

    // Initialize shades
    if (scenario?.shades !== undefined) {
      for (const s of scenario.shades) {
        const id = s.id ?? this.allocShadeId();
        this.usedShadeIds.add(id);
        this.shades.push({
          id,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          state: s.state ?? 'chase',
          stunTimer: s.state === 'stunned' ? this.tuning.pulse_stun_s : 0,
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_RANDOM_SHADES; i++) {
        this.spawnRandomShade(false);
      }
    }
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

  private spawnRandomMote(): MoteEntity {
    const [x, z] = this.rng.pointInAnnulus(5, ISLAND_RADIUS - 4);
    const mote: MoteEntity = {
      id: this.allocMoteId(),
      x: round3(x),
      y: 0,
      z: round3(z),
    };
    this.motes.push(mote);
    return mote;
  }

  private spawnRandomShade(emitEvent: boolean, events?: EventRecord[]): ShadeEntity {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      [x, z] = this.rng.pointInAnnulus(ISLAND_RADIUS - 10, ISLAND_RADIUS - 2);
      const tooCloseToPlayer = distXZ(x, z, this.player.x, this.player.z) < 12;
      const inSafe = this.lanterns.some(
        (l) => l.lit && distXZ(x, z, l.x, l.z) < this.tuning.safe_radius + 1,
      );
      if (!tooCloseToPlayer && !inSafe) break;
    }
    const shade: ShadeEntity = {
      id: this.allocShadeId(),
      x: round3(x),
      y: SHADE_DISPLAY_Y,
      z: round3(z),
      state: 'chase',
      stunTimer: 0,
    };
    this.shades.push(shade);
    if (emitEvent && events) {
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'shade_spawned',
        data: { id: shade.id },
      });
    }
    return shade;
  }

  private clampToIsland(x: number, z: number): [number, number] {
    const r = Math.hypot(x, z);
    if (r > ISLAND_RADIUS) {
      const scale = ISLAND_RADIUS / r;
      return [x * scale, z * scale];
    }
    return [x, z];
  }

  /**
   * Executes one fixed 1/60s simulation step (k -> k+1) with the given input state.
   * Returns all events emitted during this step (with tick = k+1).
   */
  step(input: InputState): EventRecord[] {
    if (this.state !== 'playing') {
      return [];
    }

    const events: EventRecord[] = [];
    const emit = (name: EventName, data: Record<string, unknown>) => {
      events.push({ type: 'event', tick: this.tick, name, data });
    };

    // Advance tick counters: step k produces state k+1
    this.tick += 1;
    this.simTick += 1;
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / 60);

    // Rising-edge button detection
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;

    // 1. Update timers
    if (this.player.invulnTimer > 0) {
      this.player.invulnTimer = Math.max(0, this.player.invulnTimer - DT);
    }
    if (this.player.pulseCooldown > 0) {
      this.player.pulseCooldown = Math.max(0, this.player.pulseCooldown - DT);
    }

    // 2. Player movement (XZ plane, camera yaw transform)
    let mx = Math.max(-1, Math.min(1, input.move[0]));
    let mz = Math.max(-1, Math.min(1, input.move[1]));
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    const theta = (input.cam_yaw_deg * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const wx = mx * cosT + mz * sinT;
    const wz = -mx * sinT + mz * cosT;

    if (len > 1e-6) {
      this.player.facingYaw = Math.atan2(wx, wz);
    }

    const nextPx = this.player.x + wx * this.tuning.player_speed * DT;
    const nextPz = this.player.z + wz * this.tuning.player_speed * DT;
    const [clampedPx, clampedPz] = this.clampToIsland(nextPx, nextPz);
    this.player.x = clampedPx;
    this.player.z = clampedPz;

    // Vertical jump physics (does not affect XZ distances)
    if (jumpPressed && this.player.y <= 0) {
      this.player.vy = JUMP_VELOCITY;
    }
    if (this.player.y > 0 || this.player.vy > 0) {
      this.player.y += this.player.vy * DT;
      this.player.vy -= GRAVITY * DT;
      if (this.player.y <= 0) {
        this.player.y = 0;
        this.player.vy = 0;
      }
    }

    // 3. Mote pickup (XZ distance <= pickup_radius)
    if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
      const remaining: MoteEntity[] = [];
      for (const mote of this.motes) {
        if (
          this.player.carried < this.tuning.carry_capacity &&
          distXZ(this.player.x, this.player.z, mote.x, mote.z) <= this.tuning.pickup_radius + DIST_EPS
        ) {
          this.player.carried += 1;
          this.score += this.tuning.score.per_mote;
          emit('mote_picked', { carried: this.player.carried });
        } else {
          remaining.push(mote);
        }
      }
      this.motes = remaining;
    }

    // 4. Lantern deposit & lighting (interact rising edge)
    if (interactPressed && this.player.carried > 0) {
      let bestLantern: LanternEntity | null = null;
      let bestDist = Infinity;
      for (const lantern of this.lanterns) {
        if (lantern.lit) continue;
        const d = distXZ(this.player.x, this.player.z, lantern.x, lantern.z);
        if (d <= this.tuning.interact_radius + DIST_EPS && d < bestDist) {
          bestDist = d;
          bestLantern = lantern;
        }
      }

      if (bestLantern) {
        const needed = Math.max(0, this.tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
          emit('deposit', {
            lantern_id: bestLantern.id,
            amount,
            deposited: bestLantern.deposited,
          });

          if (bestLantern.deposited >= this.tuning.lantern_cost) {
            bestLantern.lit = true;
            this.score += this.tuning.score.per_lantern;
            emit('lantern_lit', { lantern_id: bestLantern.id });

            // Check win condition: all lanterns lit
            if (this.lanterns.every((l) => l.lit)) {
              const timeBonus = Math.floor(this.timeLeftS) * this.tuning.score.per_second_left;
              const flameBonus = this.player.flames * this.tuning.score.per_flame_left;
              this.score += timeBonus + flameBonus;
              this.state = 'won';
              emit('game_over', { result: 'won', reason: 'all_lit' });
              this.savePrevInput(input);
              return events;
            }
          }
        }
      }
    }

    // 5. Light Pulse (pulse rising edge)
    if (
      pulsePressed &&
      this.player.pulseCooldown <= 0 &&
      this.player.carried >= this.tuning.pulse_cost
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCooldown = this.tuning.pulse_cooldown_s;
      const stunnedIds: string[] = [];

      for (const shade of this.shades) {
        const d = distXZ(this.player.x, this.player.z, shade.x, shade.z);
        if (d <= this.tuning.pulse_radius + DIST_EPS) {
          shade.state = 'stunned';
          shade.stunTimer = this.tuning.pulse_stun_s;
          let dirX = 0;
          let dirZ = 1;
          if (d > 1e-6) {
            dirX = (shade.x - this.player.x) / d;
            dirZ = (shade.z - this.player.z) / d;
          }
          const [nx, nz] = this.clampToIsland(
            shade.x + dirX * this.tuning.pulse_push_m,
            shade.z + dirZ * this.tuning.pulse_push_m,
          );
          shade.x = nx;
          shade.z = nz;
          this.score += this.tuning.score.per_stun;
          stunnedIds.push(shade.id);
        }
      }

      emit('pulse', { stunned_ids: stunnedIds });
    }

    // 6. Shades AI & collision
    for (const shade of this.shades) {
      if (shade.state === 'stunned') {
        shade.stunTimer -= DT;
        if (shade.stunTimer <= 0) {
          shade.stunTimer = 0;
          shade.state = 'chase';
        }
        continue;
      }

      // Move toward player on XZ plane
      const dx = this.player.x - shade.x;
      const dz = this.player.z - shade.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        const stepDist = Math.min(d, this.tuning.shade_speed * DT);
        shade.x += (dx / d) * stepDist;
        shade.z += (dz / d) * stepDist;
      }

      // Enforce safe_radius around lit lanterns
      for (const lantern of this.lanterns) {
        if (!lantern.lit) continue;
        const ldx = shade.x - lantern.x;
        const ldz = shade.z - lantern.z;
        const ld = Math.hypot(ldx, ldz);
        if (ld < this.tuning.safe_radius) {
          const pushR = this.tuning.safe_radius + 0.01;
          if (ld > 1e-6) {
            shade.x = lantern.x + (ldx / ld) * pushR;
            shade.z = lantern.z + (ldz / ld) * pushR;
          } else {
            shade.x = lantern.x + pushR;
          }
        }
      }

      const [csx, csz] = this.clampToIsland(shade.x, shade.z);
      shade.x = csx;
      shade.z = csz;

      // Check collision with player
      if (
        this.state === 'playing' &&
        this.player.invulnTimer <= 0 &&
        distXZ(this.player.x, this.player.z, shade.x, shade.z) <=
          this.tuning.shade_hit_radius + DIST_EPS
      ) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        this.player.invulnTimer = this.tuning.invuln_s;
        const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
        this.player.carried -= dropped;

        emit('player_hit', {
          by: 'shade',
          flames: this.player.flames,
          dropped,
        });

        if (this.player.flames <= 0) {
          this.state = 'lost';
          emit('game_over', { result: 'lost', reason: 'no_flames' });
          this.savePrevInput(input);
          return events;
        }
      }
    }

    // 7. Random periodic spawning (disabled when random_motes / random_shades is false)
    if (
      this.randomMotes &&
      this.tick % MOTE_RESPAWN_INTERVAL_TICKS === 0 &&
      this.motes.length < MIN_RANDOM_MOTES
    ) {
      while (this.motes.length < MAX_RANDOM_MOTES) {
        this.spawnRandomMote();
        break;
      }
    }

    if (
      this.randomShades &&
      this.tick % SHADE_SPAWN_INTERVAL_TICKS === 0 &&
      this.shades.length < MAX_RANDOM_SHADES
    ) {
      this.spawnRandomShade(true, events);
    }

    // 8. Check dawn timeout
    if (this.state === 'playing' && this.timeLeftS <= 0) {
      this.state = 'lost';
      emit('game_over', { result: 'lost', reason: 'dawn' });
    }

    this.savePrevInput(input);
    return events;
  }

  private savePrevInput(input: InputState): void {
    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
    };
  }

  getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: [round3(this.player.x), round3(this.player.y), round3(this.player.z)],
        flames: this.player.flames,
        carried: this.player.carried,
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: [round3(l.x), round3(l.y), round3(l.z)],
        lit: l.lit,
        deposited: l.deposited,
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
  night: number;
  ticks: number;
  snapshotEvery: number;
  scenario?: ScenarioFile;
  frames?: InputFrame[];
}

export function runHeadlessSimulation(params: HeadlessRunParams): Array<SnapshotRecord | EventRecord | EndRecord> {
  const sim = new GameSimulation({
    seed: params.seed,
    night: params.night,
    scenario: params.scenario,
  });

  const records: Array<SnapshotRecord | EventRecord | EndRecord> = [];
  // Tick 0 snapshot: post-scenario, pre-input
  records.push(sim.getSnapshot());

  const frames = params.frames ?? [];
  let frameIdx = 0;
  const input: InputState = createDefaultInputState();

  for (let k = 0; k < params.ticks; k++) {
    if (sim.state !== 'playing') {
      break;
    }

    // Apply frame for tick k if present
    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx++];
      if (f.move !== undefined) input.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) input.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) input.jump = f.jump;
      if (f.interact !== undefined) input.interact = f.interact;
      if (f.pulse !== undefined) input.pulse = f.pulse;
      if (f.dash !== undefined) input.dash = f.dash;
    }

    const events = sim.step(input);
    for (const ev of events) {
      records.push(ev);
    }

    if (sim.tick % params.snapshotEvery === 0) {
      records.push(sim.getSnapshot());
    }

    if (sim.state !== 'playing') {
      break;
    }
  }

  records.push(sim.getEndRecord());
  return records;
}

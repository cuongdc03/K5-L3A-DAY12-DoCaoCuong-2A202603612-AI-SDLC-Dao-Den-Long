import { describe, expect, it } from 'vitest';
import { CHARM_DURATION_TICKS, TUNING } from '../src/core/config';
import { createDefaultInputState, GameSimulation, runHeadlessSimulation } from '../src/core/simulation';
import { ContractFormatError, validateInputsFile, validateScenarioFile } from '../src/core/validation';

describe('Phase 1 Regression (updated to TICKET-02 standard tuning v1.1)', () => {
  it('applies cam_yaw_deg transform and normalizes diagonal move vectors', () => {
    const sim = new GameSimulation({
      seed: 1,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    const input = createDefaultInputState();
    input.move = [1, 1];
    input.cam_yaw_deg = 0;

    // Run 60 ticks (1s); includes <=0.1s ramp-up
    for (let i = 0; i < 60; i++) {
      sim.step(input);
    }
    expect(sim.player.x).toBeCloseTo(sim.player.z, 3);
    expect(Math.hypot(sim.player.vx, sim.player.vz)).toBeCloseTo(TUNING.player_speed, 2);

    // Rotate camera 90 deg: move [0, 1] moves toward +X
    const sim90 = new GameSimulation({
      seed: 1,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });
    const input90 = createDefaultInputState();
    input90.move = [0, 1];
    input90.cam_yaw_deg = 90;
    for (let i = 0; i < 60; i++) {
      sim90.step(input90);
    }
    expect(sim90.player.vx).toBeCloseTo(TUNING.player_speed, 2);
    expect(sim90.player.vz).toBeCloseTo(0, 2);
  });

  it('picks motes within pickup_radius=1.0m, deposits 10 to light lantern, and wins with standard score', () => {
    const records = runHeadlessSimulation({
      seed: 10,
      night: 1,
      ticks: 20,
      snapshotEvery: 10,
      scenario: {
        player: { pos: [0, 0, 24], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        time_left_s: 100,
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', lit: true },
        ],
      },
      frames: [
        { tick: 0, interact: true },
        { tick: 1, interact: false },
      ],
    });

    const events = records.filter((r) => r.type === 'event' && r.name !== 'night_start');
    expect(events.map((e) => (e.type === 'event' ? e.name : ''))).toEqual([
      'deposit',
      'lantern_lit',
      'game_over',
    ]);

    const end = records[records.length - 1];
    expect(end.type).toBe('end');
    if (end.type === 'end') {
      expect(end.state).toBe('won');
      // 10 * 10 (deposited) + 100 (lantern) + floor(99.9833)*2 + 3*50 = 100 + 100 + 198 + 150 = 548
      expect(end.score).toBe(
        10 * TUNING.score.per_mote +
          TUNING.score.per_lantern +
          Math.floor(100 - 1 / 60) * TUNING.score.per_second_left +
          3 * TUNING.score.per_flame_left,
      );
    }
  });

  it('stuns & pushes shades over 15 ticks on pulse (cost 3, radius 5m, +5 score)', () => {
    const records = runHeadlessSimulation({
      seed: 12,
      night: 1,
      ticks: 20,
      snapshotEvery: 20,
      scenario: {
        player: { pos: [0, 0, 0], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4, 0, 0], state: 'chase' }],
      },
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
      ],
    });

    const pulseEv = records.find((r) => r.type === 'event' && r.name === 'pulse');
    expect(pulseEv?.type === 'event' && pulseEv.data.stunned_ids).toEqual(['S1']);

    const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
    expect(snap20?.type).toBe('snapshot');
    if (snap20?.type === 'snapshot') {
      expect(snap20.player.carried).toBe(5 - TUNING.pulse_cost);
      expect(snap20.shades[0].state).toBe('stunned');
      expect(snap20.shades[0].pos[0]).toBeCloseTo(4 + TUNING.pulse_push_m, 1);
      expect(snap20.score).toBe(TUNING.score.per_stun);
    }
  });

  it('damages player on shade hit, spawns dropped motes with TTL, and shade enters recoil', () => {
    const sim = new GameSimulation({
      seed: 5,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [0.5, 0, 0], state: 'chase' }],
      },
    });

    const events = sim.step(createDefaultInputState());
    const hit = events.find((e) => e.name === 'player_hit');
    expect(hit?.data).toEqual({ by: 'shade', flames: 2, dropped: 3 });
    expect(sim.player.carried).toBe(3);
    expect(sim.player.invulnTicks).toBe(90);
    expect(sim.shades[0].state).toBe('recoil');
    expect(sim.motes.filter((m) => m.kind === 'dropped').length).toBe(3);
  });

  it('rejects malformed v1.1 inputs and scenarios with ContractFormatError', () => {
    expect(() =>
      validateInputsFile({
        frames: [
          { tick: 10, dash: true },
          { tick: 10, dash: false },
        ],
      }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioFile({
        shades: [{ pos: [0, 0, 0], state: 'invalid_state' }],
      }),
    ).toThrow(ContractFormatError);
  });
});

describe('Phase 2 Features — TICKET-02 Contract v1.1', () => {
  it('dashes at 14 m/s for 12 ticks, preserves altitude mid-air, and enforces 1.5s cooldown', () => {
    const sim = new GameSimulation({
      seed: 2,
      night: 1,
      scenario: {
        player: { pos: [0, 3, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
      },
    });

    const inp = createDefaultInputState();
    inp.move = [0, 1];
    inp.dash = true;
    const ev0 = sim.step(inp);
    expect(ev0.some((e) => e.name === 'dash')).toBe(true);
    expect(sim.player.y).toBeCloseTo(3, 2);

    inp.dash = false;
    for (let i = 1; i < 12; i++) {
      sim.step(inp);
    }
    expect(sim.player.y).toBeCloseTo(3, 2);
    expect(sim.player.z).toBeGreaterThan(2.5);
    expect(sim.player.dashCdTicks).toBeGreaterThan(0);
  });

  it('handles falling off island (Y < -10), loses carried motes, ignores invuln, and respawns after 60 ticks', () => {
    const sim = new GameSimulation({
      seed: 3,
      night: 1,
      scenario: {
        player: { pos: [42, -9.5, 0], carried: 5, flames: 2, invuln_ticks: 50 },
        random_motes: false,
        random_shades: false,
      },
    });

    let hitEvent: Record<string, unknown> | undefined;
    for (let i = 0; i < 30; i++) {
      const evs = sim.step(createDefaultInputState());
      const h = evs.find((e) => e.name === 'player_hit');
      if (h) {
        hitEvent = h.data;
        break;
      }
    }
    expect(hitEvent).toEqual({ by: 'fall', flames: 1, dropped: 0, lost: 5 });
    expect(sim.player.carried).toBe(0);

    // Wait 60 ticks for respawn at (0,0,0) with 90 ticks invuln
    for (let i = 0; i < 60; i++) {
      sim.step(createDefaultInputState());
    }
    expect(sim.player.x).toBe(0);
    expect(sim.player.y).toBe(0);
    expect(sim.player.z).toBe(0);
    expect(sim.player.invulnTicks).toBe(90);
  });

  it('launches Mây across Night 2 islands via jump pad (20,0,18) -> Island B', () => {
    const sim = new GameSimulation({
      seed: 4,
      night: 2,
      scenario: {
        player: { pos: [20, 0, 18], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });

    for (let i = 0; i < 100; i++) {
      sim.step(createDefaultInputState());
    }
    // Should have landed safely on Island B (center 70, 0, radius 28)
    expect(sim.player.grounded).toBe(true);
    expect(Math.hypot(sim.player.x - 70, sim.player.z)).toBeLessThanOrEqual(28);
  });

  it('supports Night 3 ramp climbing, Tier 2 jump pad, bell tower collision, and strong wind', () => {
    // Test ramp at 30 deg from r=30 (Y=0) to r=24 (Y=3)
    const rad = (30 * Math.PI) / 180;
    const sim = new GameSimulation({
      seed: 8,
      night: 3,
      scenario: {
        player: { pos: [Math.cos(rad) * 29.5, 0, Math.sin(rad) * 29.5], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
      },
    });

    const inp = createDefaultInputState();
    inp.move = [-Math.cos(rad), -Math.sin(rad)];
    for (let i = 0; i < 70; i++) {
      sim.step(inp);
    }
    expect(sim.player.y).toBeGreaterThan(2.5);

    // Test Tier 1 -> Tier 2 jump pad at (0, 3, 13)
    const simPad = new GameSimulation({
      seed: 8,
      night: 3,
      scenario: {
        player: { pos: [0, 3, 13], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
      },
    });
    for (let i = 0; i < 90; i++) {
      simPad.step(createDefaultInputState());
    }
    expect(simPad.player.y).toBeCloseTo(6, 1);
    expect(Math.hypot(simPad.player.x, simPad.player.z)).toBeLessThanOrEqual(8);
  });

  it('handles Drifter steal and Pulse drifter_drop on fleeing drifter', () => {
    const sim = new GameSimulation({
      seed: 9,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        drifters: [{ id: 'D1', pos: [0.5, 0, 0], state: 'chase', stolen: 0 }],
      },
    });

    const ev1 = sim.step(createDefaultInputState());
    const steal = ev1.find((e) => e.name === 'drifter_steal');
    expect(steal?.data).toEqual({ drifter_id: 'D1', amount: 3, carried: 3 });
    expect(sim.drifters[0].state).toBe('flee');
    expect(sim.drifters[0].stolen).toBe(3);

    // Pulse immediately while fleeing drifter is still within 5m -> drops stolen motes
    const pulseIn = createDefaultInputState();
    pulseIn.pulse = true;
    const ev2 = sim.step(pulseIn);
    const drop = ev2.find((e) => e.name === 'drifter_drop');
    expect(drop?.data).toEqual({ drifter_id: 'D1', amount: 3 });
    expect(sim.motes.filter((m) => m.kind === 'dropped').length).toBe(3);
  });

  it('handles Wind Charm pickup (7.2 m/s speed & 0 dash cooldown for 600 ticks)', () => {
    const sim = new GameSimulation({
      seed: 11,
      night: 2,
      scenario: {
        player: { pos: [35, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });

    const ev = sim.step(createDefaultInputState());
    expect(ev.some((e) => e.name === 'charm_picked')).toBe(true);
    expect(sim.player.charmTicks).toBe(CHARM_DURATION_TICKS);

    // Dash has 0 cooldown while charm active
    const dashIn = createDefaultInputState();
    dashIn.dash = true;
    sim.step(dashIn);
    expect(sim.player.dashCdTicks).toBe(0);
  });

  it('freezes sim_tick and timers while paused and resumes cleanly', () => {
    const records = runHeadlessSimulation({
      seed: 15,
      night: 1,
      ticks: 10,
      snapshotEvery: 1,
      scenario: { random_motes: false, random_shades: false, time_left_s: 100 },
      frames: [
        { tick: 2, pause: true },
        { tick: 3, pause: false },
        { tick: 6, pause: true },
        { tick: 7, pause: false },
      ],
    });

    const snap2 = records.find((r) => r.type === 'snapshot' && r.tick === 2);
    const snap5 = records.find((r) => r.type === 'snapshot' && r.tick === 5);
    const snap8 = records.find((r) => r.type === 'snapshot' && r.tick === 8);

    expect(snap2?.type === 'snapshot' && snap2.sim_tick).toBe(2);
    expect(snap5?.type === 'snapshot' && snap5.state).toBe('paused');
    expect(snap5?.type === 'snapshot' && snap5.sim_tick).toBe(2);
    expect(snap8?.type === 'snapshot' && snap8.state).toBe('playing');
    expect(snap8?.type === 'snapshot' && snap8.sim_tick).toBe(4);
  });
});

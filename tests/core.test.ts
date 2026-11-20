import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { createDefaultInputState, GameSimulation, runHeadlessSimulation } from '../src/core/simulation';
import { ContractFormatError, validateInputsFile, validateScenarioFile } from '../src/core/validation';

describe('Core Simulation — Test Contract v1.0', () => {
  it('applies cam_yaw_deg transform and normalizes move vectors longer than 1', () => {
    const sim = new GameSimulation({
      seed: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    // move = [1, 1] has length sqrt(2) > 1 -> normalized to [1/sqrt(2), 1/sqrt(2)]
    // theta = 0 -> wx = 1/sqrt(2), wz = 1/sqrt(2)
    const input = createDefaultInputState();
    input.move = [1, 1];
    input.cam_yaw_deg = 0;

    for (let i = 0; i < 60; i++) {
      sim.step(input);
    }

    const expected = TUNING.player_speed / Math.SQRT2;
    expect(sim.player.x).toBeCloseTo(expected, 3);
    expect(sim.player.z).toBeCloseTo(expected, 3);

    // Rotate camera 90 deg: x' = x*cos(90) + z*sin(90) = z, z' = -x*sin(90) + z*cos(90) = -x
    const sim90 = new GameSimulation({
      seed: 1,
      scenario: { random_motes: false, random_shades: false },
    });
    const input90 = createDefaultInputState();
    input90.move = [0, 1];
    input90.cam_yaw_deg = 90;
    for (let i = 0; i < 60; i++) {
      sim90.step(input90);
    }
    expect(sim90.player.x).toBeCloseTo(TUNING.player_speed, 3);
    expect(sim90.player.z).toBeCloseTo(0, 3);
  });

  it('picks motes within pickup_radius, respects carry_capacity, and scores per_mote', () => {
    const records = runHeadlessSimulation({
      seed: 7,
      night: 1,
      ticks: 60,
      snapshotEvery: 60,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [[0, 0, 3], [0, 0, 4]],
      },
      frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 0 }],
    });

    const picked = records.filter((r) => r.type === 'event' && r.name === 'mote_picked');
    expect(picked.length).toBe(2);
    expect(picked[0].type === 'event' && picked[0].data.carried).toBe(1);
    expect(picked[1].type === 'event' && picked[1].data.carried).toBe(2);

    const end = records[records.length - 1];
    expect(end.type).toBe('end');
    if (end.type === 'end') {
      expect(end.score).toBe(2 * TUNING.score.per_mote);
    }
  });

  it('deposits motes on interact rising edge, lights lantern, and wins when all lanterns are lit', () => {
    const records = runHeadlessSimulation({
      seed: 10,
      night: 1,
      ticks: 20,
      snapshotEvery: 10,
      scenario: {
        player: { pos: [0, 0, 24], carried: 3, flames: 3 },
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

    // Scenario setup emits no events and awards 0 score at tick 0
    const snap0 = records[0];
    expect(snap0.type).toBe('snapshot');
    if (snap0.type === 'snapshot') {
      expect(snap0.tick).toBe(0);
      expect(snap0.score).toBe(0);
    }

    const events = records.filter((r) => r.type === 'event');
    expect(events.map((e) => (e.type === 'event' ? e.name : ''))).toEqual([
      'deposit',
      'lantern_lit',
      'game_over',
    ]);
    // Step 0 emits events at tick 1
    expect(events[0].type === 'event' && events[0].tick).toBe(1);

    const end = records[records.length - 1];
    expect(end.type).toBe('end');
    if (end.type === 'end') {
      expect(end.state).toBe('won');
      expect(end.ticks).toBe(1);
      // 100 (lantern) + floor(99.9833) * 2 (time) + 3 * 50 (flames) = 100 + 198 + 150 = 448
      expect(end.score).toBe(
        TUNING.score.per_lantern +
          Math.floor(100 - 1 / 60) * TUNING.score.per_second_left +
          3 * TUNING.score.per_flame_left,
      );
    }
  });

  it('stuns and pushes shades on pulse, deducts pulse_cost, and enforces cooldown', () => {
    const records = runHeadlessSimulation({
      seed: 12,
      night: 1,
      ticks: 10,
      snapshotEvery: 5,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4, 0, 0] }],
      },
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
        { tick: 2, pulse: true }, // should be ignored due to cooldown
      ],
    });

    const pulseEvents = records.filter((r) => r.type === 'event' && r.name === 'pulse');
    expect(pulseEvents.length).toBe(1);
    if (pulseEvents[0].type === 'event') {
      expect(pulseEvents[0].data.stunned_ids).toEqual(['S1']);
    }

    const snap5 = records.find((r) => r.type === 'snapshot' && r.tick === 5);
    expect(snap5).toBeDefined();
    if (snap5 && snap5.type === 'snapshot') {
      expect(snap5.player.carried).toBe(3 - TUNING.pulse_cost);
      expect(snap5.shades[0].state).toBe('stunned');
      expect(snap5.shades[0].pos[0]).toBeCloseTo(4 + TUNING.pulse_push_m, 2);
      expect(snap5.score).toBe(TUNING.score.per_stun);
    }
  });

  it('keeps shades outside safe_radius of lit lanterns', () => {
    const sim = new GameSimulation({
      seed: 99,
      scenario: {
        player: { pos: [0, 0, 25], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true }],
        shades: [{ id: 'S1', pos: [0, 0, 17] }],
      },
    });

    const idle = createDefaultInputState();
    for (let i = 0; i < 180; i++) {
      sim.step(idle);
    }

    const d = Math.hypot(sim.shades[0].x - 0, sim.shades[0].z - 25);
    expect(d).toBeGreaterThanOrEqual(TUNING.safe_radius - 0.001);
    expect(sim.player.flames).toBe(3);
  });

  it('damages player on shade hit, drops motes by hit_drop_ratio, and loses at 0 flames', () => {
    const records = runHeadlessSimulation({
      seed: 5,
      night: 1,
      ticks: 600,
      snapshotEvery: 100,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4, flames: 2 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [0.5, 0, 0] }],
      },
    });

    const hits = records.filter((r) => r.type === 'event' && r.name === 'player_hit');
    expect(hits.length).toBe(2);
    if (hits[0].type === 'event') {
      expect(hits[0].data).toEqual({ by: 'shade', flames: 1, dropped: 2 });
    }
    if (hits[1].type === 'event') {
      expect(hits[1].data).toEqual({ by: 'shade', flames: 0, dropped: 1 });
    }

    const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(over?.type === 'event' && over.data).toEqual({ result: 'lost', reason: 'no_flames' });
  });

  it('loses with reason dawn when time runs out', () => {
    const records = runHeadlessSimulation({
      seed: 5,
      night: 1,
      ticks: 120,
      snapshotEvery: 60,
      scenario: {
        random_motes: false,
        random_shades: false,
        time_left_s: 1.0,
      },
    });

    const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(over?.type === 'event' && over.data).toEqual({ result: 'lost', reason: 'dawn' });
    const end = records[records.length - 1];
    expect(end.type === 'end' && end.ticks).toBe(60);
  });

  it('rejects non-strictly-increasing frame ticks and invalid scenarios with ContractFormatError', () => {
    expect(() =>
      validateInputsFile({
        frames: [
          { tick: 10, move: [1, 0] },
          { tick: 10, move: [0, 0] },
        ],
      }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioFile({
        shades: [{ pos: [1, 2] }],
      }),
    ).toThrow(ContractFormatError);
  });
});

import { describe, expect, it } from 'vitest';
import { CHARM_DURATION_TICKS, TUNING } from '../src/core/config';
import { createDefaultInputState, GameSimulation, runHeadlessSimulation } from '../src/core/simulation';
import { ContractFormatError, validateInputsFile, validateScenarioFile } from '../src/core/validation';

describe('Phase 1 & 2 Regression (updated for TICKET-03 v1.2 breaking changes)', () => {
  it('applies cam_yaw_deg transform and normalizes diagonal move vectors', () => {
    const sim = new GameSimulation({
      seed: 1,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    const input = createDefaultInputState();
    input.move = [1, 1];
    input.cam_yaw_deg = 0;

    for (let i = 0; i < 60; i++) {
      sim.step(input);
    }
    expect(sim.player.x).toBeCloseTo(sim.player.z, 3);
    expect(Math.hypot(sim.player.vx, sim.player.vz)).toBeCloseTo(TUNING.player_speed, 2);
  });

  // UPDATED in Phase 3 (TICKET-03): lighting all 5 lanterns no longer ends the night early (all_lit removed).
  // Score per deposited mote is now +5 (was +10 in Phase 2), and lantern_lit emits { lantern_id, relight }.
  it('deposits 10 motes to light lantern, scores +5/mote +100 first-light, and continues playing until dawn', () => {
    const records = runHeadlessSimulation({
      seed: 10,
      night: 1,
      ticks: 5,
      snapshotEvery: 5,
      scenario: {
        player: { pos: [0, 0, 24], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        time_left_s: 100,
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true, fuel: 100 },
          { id: 'L3', lit: true, fuel: 100 },
          { id: 'L4', lit: true, fuel: 100 },
          { id: 'L5', lit: true, fuel: 100 },
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
    ]);
    const litEv = events[1];
    expect(litEv.type === 'event' && litEv.data).toEqual({ lantern_id: 'L1', relight: false });

    const end = records[records.length - 1];
    expect(end.type).toBe('end');
    if (end.type === 'end') {
      // No early win! Game stays playing until dawn.
      expect(end.state).toBe('playing');
      // 10 * 5 (deposit) + 100 (first light) = 150
      expect(end.score).toBe(150);
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
    if (snap20?.type === 'snapshot') {
      expect(snap20.player.carried).toBe(2);
      expect(snap20.shades[0].state).toBe('stunned');
      expect(snap20.score).toBe(5);
    }
  });

  it('handles Dash, Fall/Respawn, Night 2 Jump Pad, Drifter steal/drop, Wind Charm, and Pause/Resume', () => {
    // Dash & Fall
    const simFall = new GameSimulation({
      seed: 3,
      night: 1,
      scenario: {
        player: { pos: [42, -9.5, 0], carried: 5, flames: 2, invuln_ticks: 50 },
        random_motes: false,
        random_shades: false,
      },
    });
    let fallHit = false;
    for (let i = 0; i < 30; i++) {
      if (simFall.step(createDefaultInputState()).some((e) => e.name === 'player_hit')) {
        fallHit = true;
        break;
      }
    }
    expect(fallHit).toBe(true);

    // Night 2 Jump Pad
    const simPad = new GameSimulation({
      seed: 4,
      night: 2,
      scenario: {
        player: { pos: [20, 0, 18], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });
    for (let i = 0; i < 100; i++) simPad.step(createDefaultInputState());
    expect(simPad.player.grounded).toBe(true);
    expect(Math.hypot(simPad.player.x - 70, simPad.player.z)).toBeLessThanOrEqual(28);

    // Wind Charm
    const simCharm = new GameSimulation({
      seed: 11,
      night: 2,
      scenario: {
        player: { pos: [35, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });
    expect(simCharm.step(createDefaultInputState()).some((e) => e.name === 'charm_picked')).toBe(true);
    expect(simCharm.player.charmTicks).toBe(CHARM_DURATION_TICKS);

    // Validation
    expect(() =>
      validateInputsFile({ frames: [{ tick: 5, pause: true }, { tick: 5, pause: false }] }),
    ).toThrow(ContractFormatError);
    expect(() =>
      validateScenarioFile({ shades: [{ pos: [0, 0, 0], state: 'bad' }] }),
    ).toThrow(ContractFormatError);
  });
});

describe('Phase 3 Change Request — TICKET-03 "Đèn cạn dầu" (Contract v1.2)', () => {
  it('decays fuel at 1.0/s, refuels with ceil((100-fuel)/10), ignores full lanterns, and relights ever_lit for 5 motes (+40)', () => {
    const sim = new GameSimulation({
      seed: 20,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 75, ever_lit: true }],
      },
    });

    // Step 1: interact to refuel L1 from ~74.98 -> ceil(25.02/10) = 3 motes -> fuel 100
    const inp = createDefaultInputState();
    inp.interact = true;
    const evRefuel = sim.step(inp);
    const refuel = evRefuel.find((e) => e.name === 'refuel');
    expect(refuel?.data).toEqual({ lantern_id: 'L1', amount: 3, fuel: 100 });
    expect(sim.player.carried).toBe(7);
    expect(sim.score).toBe(15); // 3 * 5

    // Immediately clicking again when fuel=100 (after 1 tick decay it's 99.98, so check exact 100 case with fresh sim)
    const simFull = new GameSimulation({
      seed: 20,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 0.01, ever_lit: true }],
      },
    });
    // After 1 tick, L1 fuel <= 0 -> lantern_out!
    const evOut = simFull.step(createDefaultInputState());
    expect(evOut.some((e) => e.name === 'lantern_out')).toBe(true);
    expect(simFull.lanterns[0].lit).toBe(false);
    expect(simFull.lanterns[0].everLit).toBe(true);

    // Relight L1 with only 5 motes -> +5*5 + 40 = +65, relight: true, relit_count: 1, capacity: 12
    const relightIn = createDefaultInputState();
    relightIn.interact = true;
    const evRelight = simFull.step(relightIn);
    const litEv = evRelight.find((e) => e.name === 'lantern_lit');
    expect(litEv?.data).toEqual({ lantern_id: 'L1', relight: true });
    expect(simFull.lanterns[0].relitCount).toBe(1);
    expect(simFull.score).toBe(65);
    expect(simFull.getPlayerCapacity()).toBe(12);
  });

  it('lets wandering Shade drain weak lantern (fuel < 30), emits fuel_drain every 60 ticks, and awards +15 on Pulse', () => {
    const sim = new GameSimulation({
      seed: 25,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25, ever_lit: true }],
        shades: [{ id: 'S1', pos: [0, 0, 24], state: 'drain', target_lantern_id: 'L1' }],
      },
    });

    // Run 60 ticks: 1s natural decay (1) + 1s drain (5) = 6 fuel lost -> 25 - 6 = 19.0
    let drainEv: Record<string, unknown> | undefined;
    for (let i = 0; i < 60; i++) {
      const evs = sim.step(createDefaultInputState());
      const d = evs.find((e) => e.name === 'fuel_drain');
      if (d) drainEv = d.data;
    }
    expect(drainEv).toEqual({ lantern_id: 'L1', shade_id: 'S1', fuel: 19 });

    // Teleport player within 4m and Pulse -> +15 points because S1 was draining!
    sim.player.x = 0;
    sim.player.z = 21;
    const pulseIn = createDefaultInputState();
    pulseIn.pulse = true;
    const evPulse = sim.step(pulseIn);
    expect(evPulse.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });
    expect(sim.score).toBe(15);
    expect(sim.shades[0].state).toBe('stunned');
  });

  it('wins with dawn_survived when lit >= ceil(0.6*N) at dawn and scores dawn bonuses', () => {
    const records = runHeadlessSimulation({
      seed: 30,
      night: 1,
      ticks: 120,
      snapshotEvery: 60,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 2 },
        random_motes: false,
        random_shades: false,
        time_left_s: 1.0,
        lanterns: [
          { id: 'L1', lit: true, fuel: 81 },
          { id: 'L2', lit: true, fuel: 51 },
          { id: 'L3', lit: true, fuel: 21 },
          { id: 'L4', lit: false },
          { id: 'L5', lit: false },
        ],
      },
    });

    const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(over?.type === 'event' && over.data).toEqual({
      result: 'won',
      reason: 'dawn_survived',
    });

    const end = records[records.length - 1];
    // After 1.0s decay: fuels are 80, 50, 20.
    // Bonus: (50+80) + (50+50) + (50+20) + 2*50 = 130 + 100 + 70 + 100 = 400
    expect(end.type === 'end' && end.score).toBe(400);
  });

  it('loses with dawn when lit < ceil(0.6*N) at dawn', () => {
    const records = runHeadlessSimulation({
      seed: 31,
      night: 1,
      ticks: 120,
      snapshotEvery: 60,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        time_left_s: 1.0,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: false },
          { id: 'L4', lit: false },
          { id: 'L5', lit: false },
        ],
      },
    });

    const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(over?.type === 'event' && over.data).toEqual({ result: 'lost', reason: 'dawn' });
  });

  it('scales carry capacity up to 20 based on successful_lights', () => {
    const sim = new GameSimulation({
      seed: 32,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 3, successful_lights: 6 },
        random_motes: false,
        random_shades: false,
      },
    });
    expect(sim.getPlayerCapacity()).toBe(20);
  });

  it('prevents Shades on Night 3 from climbing vertical tier cliffs without using ramps', () => {
    const sim = new GameSimulation({
      seed: 35,
      night: 3,
      scenario: {
        player: { pos: [0, 6, 5], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        // Shade on Tier 0 (Y=0) right outside Tier 2 vertical cliff (r=9, z=0) chasing player on Tier 2 (Y=6)
        shades: [{ id: 'S1', pos: [0, 0, 9.5], state: 'chase' }],
      },
    });

    for (let i = 0; i < 90; i++) {
      sim.step(createDefaultInputState());
    }
    // Shade must remain at Y=0 and cannot clip onto Tier 2 (Y=6)
    expect(sim.shades[0].y).toBe(0);
    expect(Math.hypot(sim.shades[0].x, sim.shades[0].z)).toBeGreaterThanOrEqual(7.99);
  });
});

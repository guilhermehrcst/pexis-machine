import { describe, expect, it } from 'vitest';
import type { StepOutcome } from './client';
import { parseSnapshot } from './boundary';
import { rawSnapshot } from './fixtures';
import { PACES, RunController, type Scheduler, type StopReason } from './runner';
import type { MachineStatus } from './types';

class ManualScheduler implements Scheduler {
  pending = new Map<number, () => void>();
  #next = 1;
  setTimeout(callback: () => void): unknown {
    const id = this.#next++;
    this.pending.set(id, callback);
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** Fires the single pending timer. */
  fire(): void {
    expect(this.pending.size).toBeLessThanOrEqual(1);
    const [entry] = this.pending;
    if (!entry) throw new Error('no pending timer');
    this.pending.delete(entry[0]);
    entry[1]();
  }
}

function outcome(status: MachineStatus): StepOutcome {
  const fault = status === 'faulted' ? 'memory-out-of-bounds' : 'none';
  return { snapshot: parseSnapshot(rawSnapshot({ status, fault })), program: null, events: [] };
}

function harness(statuses: MachineStatus[], options: { maxStepsPerRun?: number } = {}) {
  const scheduler = new ManualScheduler();
  const stops: StopReason[] = [];
  const ticks: number[] = [];
  let steps = 0;
  const controller = new RunController({
    step: () => {
      const status = statuses[Math.min(steps, statuses.length - 1)] ?? 'running';
      steps += 1;
      return outcome(status);
    },
    onTick: (outcomes) => ticks.push(outcomes.length),
    onStop: (reason) => stops.push(reason),
    scheduler,
    ...options,
  });
  return { controller, scheduler, stops, ticks, steps: () => steps };
}

describe('RunController', () => {
  it('steps immediately, then on each timer, and stops by itself on halt', () => {
    const h = harness(['running', 'running', 'halted']);
    h.controller.start();
    expect(h.steps()).toBe(1);
    expect(h.controller.running).toBe(true);
    h.scheduler.fire();
    h.scheduler.fire();
    expect(h.steps()).toBe(3);
    expect(h.stops).toEqual(['halted']);
    expect(h.controller.running).toBe(false);
    expect(h.scheduler.pending.size).toBe(0);
  });

  it('stops by itself on fault', () => {
    const h = harness(['running', 'faulted']);
    h.controller.start();
    h.scheduler.fire();
    expect(h.stops).toEqual(['faulted']);
    expect(h.scheduler.pending.size).toBe(0);
  });

  it('pause takes effect before the next step and cancels the timer', () => {
    const h = harness(['running']);
    h.controller.start();
    h.controller.pause();
    expect(h.stops).toEqual(['paused']);
    expect(h.scheduler.pending.size).toBe(0);
    expect(h.steps()).toBe(1);
  });

  it('never creates duplicate timers on repeated start or pace changes', () => {
    const h = harness(['running']);
    h.controller.start();
    h.controller.start();
    h.controller.setPace('fast');
    h.controller.setPace('slow');
    expect(h.scheduler.pending.size).toBe(1);
    expect(h.steps()).toBe(1);
  });

  it('batches unpaced steps but never exceeds stepsPerTick in one tick', () => {
    const h = harness(['running']);
    h.controller.setPace('max');
    h.controller.start();
    expect(h.ticks).toEqual([PACES.max.stepsPerTick]);
    h.controller.pause();
  });

  it('stops a batch at the halting step', () => {
    const statuses: MachineStatus[] = ['running', 'running', 'running', 'halted'];
    const h = harness(statuses);
    h.controller.setPace('max');
    h.controller.start();
    expect(h.steps()).toBe(4);
    expect(h.ticks).toEqual([4]);
    expect(h.stops).toEqual(['halted']);
  });

  it('applies the browser-side step budget as a pause, not a machine fault', () => {
    const h = harness(['running'], { maxStepsPerRun: 3 });
    h.controller.start();
    h.scheduler.fire();
    h.scheduler.fire();
    expect(h.steps()).toBe(3);
    expect(h.stops).toEqual(['budget']);
  });

  it('stops with error when a step throws, delivering completed outcomes first', () => {
    const scheduler = new ManualScheduler();
    const stops: StopReason[] = [];
    let calls = 0;
    const controller = new RunController({
      step: () => {
        calls += 1;
        if (calls === 2) throw new Error('boundary');
        return outcome('running');
      },
      onTick: () => undefined,
      onStop: (reason) => stops.push(reason),
      scheduler,
    });
    controller.start();
    scheduler.fire();
    expect(stops).toEqual(['error']);
    expect(scheduler.pending.size).toBe(0);
  });

  it('dispose stops silently', () => {
    const h = harness(['running']);
    h.controller.start();
    h.controller.dispose();
    expect(h.stops).toEqual([]);
    expect(h.scheduler.pending.size).toBe(0);
  });

  it('pausing from inside onTick prevents rescheduling', () => {
    const scheduler = new ManualScheduler();
    const stops: StopReason[] = [];
    const controller: RunController = new RunController({
      step: () => outcome('running'),
      onTick: () => controller.pause(),
      onStop: (reason) => stops.push(reason),
      scheduler,
    });
    controller.start();
    expect(stops).toEqual(['paused']);
    expect(scheduler.pending.size).toBe(0);
  });
});

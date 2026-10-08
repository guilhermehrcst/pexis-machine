// React binding for the simulator. React keeps only what it needs to render:
// the latest snapshot, the decoded program, and a short history of events the
// core reported. The machine itself lives in WebAssembly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoundaryError } from './boundary';
import { createMachineClient, type MachineClient, type MachineState, type StepOutcome } from './client';
import { RunController, type Pace, type StopReason } from './runner';
import { isTerminal, type ExperimentInfo, type LoadedProgram, type MachineEvent, type MachineSnapshot } from './types';

export const HISTORY_LIMIT = 48;

export interface StepRecord {
  /** 1-based step number since the experiment was loaded or reset. */
  readonly index: number;
  readonly events: readonly MachineEvent[];
}

export interface LabReady {
  readonly phase: 'ready';
  readonly client: MachineClient;
  readonly experiments: readonly ExperimentInfo[];
  readonly experimentId: string;
  readonly snapshot: MachineSnapshot;
  readonly previous: MachineSnapshot | null;
  readonly program: LoadedProgram | null;
  /** The most recent step; the 3D scene animates exactly these events. */
  readonly lastStep: StepRecord | null;
  readonly history: readonly StepRecord[];
  /** Increments on every state change; used to re-read RAM pages. */
  readonly version: number;
  readonly running: boolean;
  readonly pace: Pace;
  readonly stopReason: StopReason | null;
}

export type LabState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | LabReady;

export interface LabCommands {
  readonly load: (experimentId: string) => void;
  readonly reset: () => void;
  readonly step: () => void;
  readonly toggleRun: () => void;
  readonly pause: () => void;
  readonly setPace: (pace: Pace) => void;
}

const DEFAULT_EXPERIMENT = 'scalar-compute';

function describeError(error: unknown): string {
  if (error instanceof BoundaryError) return error.message;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'Unknown error';
}

export function useMachineLab(): readonly [LabState, LabCommands] {
  const [state, setState] = useState<LabState>({ phase: 'loading' });
  const clientRef = useRef<MachineClient | null>(null);
  const runnerRef = useRef<RunController | null>(null);
  const stepIndexRef = useRef(0);

  const fail = useCallback((error: unknown) => {
    // Fail closed: stop everything and refuse further interaction.
    runnerRef.current?.dispose();
    console.error(error);
    setState({ phase: 'error', message: describeError(error) });
  }, []);

  const applyLoaded = useCallback((experimentId: string, loaded: MachineState) => {
    stepIndexRef.current = 0;
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      return {
        ...prev,
        experimentId,
        snapshot: loaded.snapshot,
        previous: null,
        program: loaded.program,
        lastStep: null,
        history: [],
        version: prev.version + 1,
        running: false,
        stopReason: null,
      };
    });
  }, []);

  const applyOutcomes = useCallback((outcomes: readonly StepOutcome[]) => {
    const last = outcomes.at(-1);
    if (!last) return;
    const records = outcomes.map((outcome) => {
      stepIndexRef.current += 1;
      return { index: stepIndexRef.current, events: outcome.events };
    });
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      const history = [...prev.history, ...records].slice(-HISTORY_LIMIT);
      return {
        ...prev,
        previous: prev.snapshot,
        snapshot: last.snapshot,
        program: last.program,
        lastStep: records.at(-1) ?? null,
        history,
        version: prev.version + 1,
      };
    });
  }, []);

  // Boot: load the WebAssembly module, create the client and the runner.
  useEffect(() => {
    let cancelled = false;
    createMachineClient()
      .then((client) => {
        if (cancelled) {
          client.dispose();
          return;
        }
        clientRef.current = client;
        runnerRef.current = new RunController({
          step: () => client.step(),
          onTick: applyOutcomes,
          onStop: (reason, error) => {
            if (reason === 'error') {
              fail(error);
              return;
            }
            setState((prev) => (prev.phase === 'ready' ? { ...prev, running: false, stopReason: reason } : prev));
          },
        });
        const experimentId = client.experiments.some((e) => e.id === DEFAULT_EXPERIMENT)
          ? DEFAULT_EXPERIMENT
          : (client.experiments[0]?.id ?? '');
        const loaded = client.load(experimentId);
        stepIndexRef.current = 0;
        setState({
          phase: 'ready',
          client,
          experiments: client.experiments,
          experimentId,
          snapshot: loaded.snapshot,
          previous: null,
          program: loaded.program,
          lastStep: null,
          history: [],
          version: 0,
          running: false,
          pace: runnerRef.current.pace,
          stopReason: null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) fail(error);
      });

    return () => {
      cancelled = true;
      runnerRef.current?.dispose();
      runnerRef.current = null;
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [applyOutcomes, fail]);

  const guarded = useCallback(
    (action: (client: MachineClient, runner: RunController) => void) => {
      const client = clientRef.current;
      const runner = runnerRef.current;
      if (!client || !runner || client.disposed) return;
      try {
        action(client, runner);
      } catch (error) {
        fail(error);
      }
    },
    [fail],
  );

  const commands = useMemo<LabCommands>(
    () => ({
      load: (experimentId) =>
        guarded((client, runner) => {
          runner.dispose();
          applyLoaded(experimentId, client.load(experimentId));
        }),
      reset: () =>
        guarded((client, runner) => {
          runner.dispose();
          const loaded = client.reset();
          applyLoaded(loaded.program?.experimentId ?? '', loaded);
        }),
      step: () =>
        guarded((client, runner) => {
          if (runner.running) return;
          const current = client.state().snapshot;
          if (isTerminal(current.status)) return;
          applyOutcomes([client.step()]);
          setState((prev) => (prev.phase === 'ready' ? { ...prev, stopReason: null } : prev));
        }),
      toggleRun: () =>
        guarded((client, runner) => {
          if (runner.running) {
            runner.pause();
            return;
          }
          if (isTerminal(client.state().snapshot.status)) return;
          setState((prev) => (prev.phase === 'ready' ? { ...prev, running: true, stopReason: null } : prev));
          runner.start();
        }),
      pause: () => guarded((_client, runner) => runner.pause()),
      setPace: (pace) =>
        guarded((_client, runner) => {
          runner.setPace(pace);
          setState((prev) => (prev.phase === 'ready' ? { ...prev, pace } : prev));
        }),
    }),
    [guarded, applyLoaded, applyOutcomes],
  );

  return [state, commands] as const;
}

import { PauseIcon, PlayIcon, ResetIcon, TrackNextIcon } from '@radix-ui/react-icons';
import { STATUS_LABEL, FAULT_LABEL } from '../machine/format';
import { PACES, PACE_ORDER, type Pace } from '../machine/runner';
import type { LabCommands, LabReady } from '../machine/useMachineLab';
import { isTerminal } from '../machine/types';

interface ToolbarProps {
  readonly lab: LabReady;
  readonly commands: LabCommands;
  readonly onOpenNav: () => void;
}

export const PLANNED_EXPERIMENTS = [{ id: 'gpu-vector-add', title: 'GPU Vector Add', milestone: 'M4' }] as const;

export function Toolbar({ lab, commands, onOpenNav }: ToolbarProps) {
  const { snapshot, running } = lab;
  const terminal = isTerminal(snapshot.status);
  const statusText =
    snapshot.status === 'faulted' ? `${STATUS_LABEL.faulted} · ${FAULT_LABEL[snapshot.fault]}` : STATUS_LABEL[snapshot.status];

  return (
    <div className="toolbar" role="toolbar" aria-label="Machine controls">
      <button type="button" className="icon-button toolbar__menu" onClick={onOpenNav} aria-label="Open navigation">
        <span aria-hidden="true" className="toolbar__menu-glyph" />
      </button>

      <div className="toolbar__group">
        <label className="field">
          <span className="field__label">Experiment</span>
          <select
            className="select"
            value={lab.experimentId}
            onChange={(event) => commands.load(event.target.value)}
          >
            {lab.experiments.map((experiment) => (
              <option key={experiment.id} value={experiment.id}>
                {experiment.title}
              </option>
            ))}
            {PLANNED_EXPERIMENTS.map((planned) => (
              <option key={planned.id} value={planned.id} disabled>
                {planned.title} — Planned · {planned.milestone}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar__group toolbar__controls">
        <button type="button" className="button" onClick={commands.reset} title="Reset and reload the experiment (R)">
          <ResetIcon aria-hidden="true" />
          <span>Reset</span>
        </button>
        <button
          type="button"
          className="button"
          onClick={commands.step}
          disabled={running || terminal}
          title="Execute exactly one instruction in the core (S)"
        >
          <TrackNextIcon aria-hidden="true" />
          <span>Step</span>
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={commands.toggleRun}
          disabled={!running && terminal}
          aria-pressed={running}
          title="Run until HALT or FAULT, or pause (Space)"
        >
          {running ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
          <span>{running ? 'Pause' : 'Run'}</span>
        </button>
        <label className="field field--inline">
          <span className="field__label">Pace</span>
          <select
            className="select select--compact"
            value={lab.pace}
            onChange={(event) => commands.setPace(event.target.value as Pace)}
            title="Browser visualization pace. Not a clock frequency."
          >
            {PACE_ORDER.map((pace) => (
              <option key={pace} value={pace}>
                {PACES[pace].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group toolbar__status">
        <span className="chip" title="M0/M1 execute a functional model: cycles are abstract, there is no physical timing.">
          Model · Functional
        </span>
        <span
          className={`status status--${snapshot.status}`}
          role="status"
          aria-live="polite"
          title="Core status from the snapshot. Running = program started and not yet halted or faulted."
        >
          <span className="status__dot" aria-hidden="true" />
          {statusText}
          {running ? <span className="status__host"> · auto-run</span> : null}
        </span>
      </div>
    </div>
  );
}

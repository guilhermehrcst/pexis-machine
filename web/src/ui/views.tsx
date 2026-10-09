import { ArrowRightIcon, ExternalLinkIcon } from '@radix-ui/react-icons';
import { STATUS_LABEL } from '../machine/format';
import type { LabCommands, LabReady } from '../machine/useMachineLab';
import type { ComponentId } from '../scene/transfers';
import { ActivityTimeline } from './ActivityTimeline';
import { EventsPanel } from './EventsPanel';
import { Inspector } from './Inspector';
import { MemoryPanel } from './MemoryPanel';
import { ProgramPanel } from './ProgramPanel';
import { RegistersPanel } from './RegistersPanel';
import { SceneView } from './SceneView';
import { METRICS, TelemetryPanel, formatMetric } from './TelemetryPanel';
import { PLANNED_EXPERIMENTS } from './Toolbar';

const REPO = 'https://github.com/guilhermehrcst/pexis-machine/blob/main';

interface MachineViewProps {
  readonly lab: LabReady;
  readonly selected: ComponentId | null;
  readonly onSelect: (id: ComponentId | null) => void;
  readonly reducedMotion: boolean;
  readonly width: number;
}

export function MachineView({ lab, selected, onSelect, reducedMotion, width }: MachineViewProps) {
  return (
    <div className="workspace">
      <section className="stage" aria-label="Machine">
        <div className="stage__viewport">
          <SceneView lab={lab} selected={selected} onSelect={onSelect} reducedMotion={reducedMotion} />
          <Inspector lab={lab} selected={selected} onSelect={onSelect} width={width} />
          <div className="stage__legend" aria-hidden="true">
            <span className="legend__item legend__item--fetch">instruction fetch</span>
            <span className="legend__item legend__item--read">load · RAM → CPU</span>
            <span className="legend__item legend__item--write">store · CPU → RAM</span>
          </div>
        </div>
        <ActivityTimeline lab={lab} width={width} />
      </section>
      <div className="rail">
        <ProgramPanel lab={lab} width={width} />
        <RegistersPanel lab={lab} width={width} />
        <TelemetryPanel lab={lab} />
      </div>
      <MemoryPanel lab={lab} width={width} />
      <EventsPanel lab={lab} width={width} />
    </div>
  );
}

export function OverviewView({ lab, onOpenMachine }: { readonly lab: LabReady; readonly onOpenMachine: () => void }) {
  const experiment = lab.experiments.find((e) => e.id === lab.experimentId);
  return (
    <div className="page">
      <header className="page__header">
        <p className="eyebrow">Pexis Machine</p>
        <h1>Experimental computer architecture laboratory</h1>
        <p className="lede">Simulation is truth. Visualization is observation.</p>
      </header>

      <ol className="boundary" aria-label="Architecture boundary">
        <li className="boundary__step">
          <span className="boundary__name">C++ core</span>
          <span className="boundary__role">Truth — executes, owns registers, RAM, faults, telemetry, events</span>
        </li>
        <li className="boundary__step">
          <span className="boundary__name">WebAssembly</span>
          <span className="boundary__role">Bridge — the same Machine, a narrow typed adapter</span>
        </li>
        <li className="boundary__step">
          <span className="boundary__name">Web Lab</span>
          <span className="boundary__role">Observer and controller — presents, never simulates</span>
        </li>
      </ol>

      <div className="cards">
        <section className="card">
          <h2>Live machine</h2>
          <p>
            <span key={experiment?.id ?? 'none'}>{experiment?.title ?? 'No experiment'}</span> ·{' '}
            <strong translate="no">{STATUS_LABEL[lab.snapshot.status]}</strong>
          </p>
          <button type="button" className="button button--primary" onClick={onOpenMachine}>
            Open machine <ArrowRightIcon aria-hidden="true" />
          </button>
        </section>
        <section className="card">
          <h2>Milestones</h2>
          <ul className="milestones">
            <li className="is-done">M0 · Machine Alive</li>
            <li className="is-current">M1 · Visible Machine</li>
            <li>M2 · Memory Hierarchy</li>
            <li>M3 · Timing</li>
            <li>M4 · Heterogeneous Machine</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export function ExperimentsView({
  lab,
  commands,
  onOpenMachine,
}: {
  readonly lab: LabReady;
  readonly commands: LabCommands;
  readonly onOpenMachine: () => void;
}) {
  return (
    <div className="page">
      <header className="page__header">
        <p className="eyebrow">Experiments</p>
        <h1>Workloads defined in the C++ core</h1>
        <p className="lede">Each experiment is real program bytes. Loading one resets the machine.</p>
      </header>
      <ul className="cards cards--list">
        {lab.experiments.map((experiment) => (
          <li key={experiment.id} className={experiment.id === lab.experimentId ? 'card is-current' : 'card'}>
            <h2>{experiment.title}</h2>
            <p>{experiment.summary}</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                commands.load(experiment.id);
                onOpenMachine();
              }}
            >
              <span key={experiment.id === lab.experimentId ? 'reload' : 'load'}>
                {experiment.id === lab.experimentId ? 'Reload' : 'Load'}
              </span>{' '}
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </li>
        ))}
        {PLANNED_EXPERIMENTS.map((planned) => (
          <li key={planned.id} className="card is-planned" aria-disabled="true">
            <h2>{planned.title}</h2>
            <p>Requires the GPU model. Not executable in M1, and never simulated in its absence.</p>
            <span className="chip chip--planned">Planned · {planned.milestone}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TelemetryView({ lab }: { readonly lab: LabReady }) {
  return (
    <div className="page">
      <header className="page__header">
        <p className="eyebrow">Telemetry</p>
        <h1>Counters measured by the core</h1>
        <p className="lede">
          Every value below is read from the simulator snapshot. IPC is intentionally not shown: in the functional
          model it is 1 by construction and says nothing physical.
        </p>
      </header>
      <div className="page__grid">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Value</th>
              <th scope="col">Definition</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((spec) => (
              <tr key={spec.key}>
                <th scope="row" translate={spec.term ? 'no' : undefined}>
                  {spec.label}
                </th>
                <td className="mono" translate="no">
                  {formatMetric(spec, lab.snapshot.telemetry)}
                </td>
                <td>{spec.definition}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TelemetryPanel lab={lab} />
      </div>
    </div>
  );
}

export function DocsView() {
  const docs = [
    ['README', 'README.md', 'Build, run, repository map.'],
    ['Architecture', 'docs/architecture.md', 'Machine model, ISA, fault model, telemetry, events.'],
    ['WebAssembly boundary', 'docs/wasm-boundary.md', 'The adapter contract between C++ and the browser.'],
    ['Web Lab', 'docs/web-lab.md', 'How the browser observes and controls the machine.'],
    ['Vision', 'docs/vision.md', 'Principles of the laboratory.'],
  ] as const;
  return (
    <div className="page">
      <header className="page__header">
        <p className="eyebrow">Docs</p>
        <h1>Project documentation</h1>
        <p className="lede">The repository is the source of truth for the contracts below.</p>
      </header>
      <ul className="cards cards--list">
        {docs.map(([title, path, summary]) => (
          <li key={path} className="card">
            <h2>{title}</h2>
            <p>{summary}</p>
            <a className="link" href={`${REPO}/${path}`} target="_blank" rel="noreferrer noopener">
              {path} <ExternalLinkIcon aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

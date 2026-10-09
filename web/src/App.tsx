import { useCallback, useEffect, useState } from 'react';
import { addressWidth } from './machine/format';
import { useMachineLab } from './machine/useMachineLab';
import type { ComponentId } from './scene/transfers';
import type { InspectionState } from './ui/inspectionState';
import { Sidebar, type NavTarget, type ViewId } from './ui/Sidebar';
import { Toolbar } from './ui/Toolbar';
import { usePrefersReducedMotion } from './ui/usePrefersReducedMotion';
import { DocsView, ExperimentsView, MachineView, OverviewView, TelemetryView } from './ui/views';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function App() {
  const [lab, commands] = useMachineLab();
  const [view, setView] = useState<ViewId>('machine');
  const [selected, setSelectedComponent] = useState<ComponentId | null>(null);
  const [inspection, setInspection] = useState<InspectionState | null>(null);
  // Selecting another component (or none) ends an exploded inspection; the
  // scene reassembles the inspected one.
  const setSelected = useCallback((id: ComponentId | null) => {
    setSelectedComponent(id);
    setInspection((current) => (current !== null && current.component !== id ? null : current));
  }, []);
  const [navOpen, setNavOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const ready = lab.phase === 'ready';

  const navigate = useCallback((target: NavTarget) => {
    setView(target.view);
    setSelected(target.focus ?? null);
    setInspection(null);
    setNavOpen(false);
  }, [setSelected]);

  // Keyboard: S = step, Space = run/pause, R = reset. Ignored while typing or
  // when a modifier is held; Space is ignored on focused buttons.
  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        commands.step();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        commands.reset();
      } else if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        commands.toggleRun();
      } else if (event.key === 'Escape') {
        setNavOpen(false);
        setInspection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, commands]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar
        view={view}
        selected={selected}
        open={navOpen}
        onNavigate={navigate}
        onClose={() => setNavOpen(false)}
        coreReady={ready}
      />
      <div className="main">
        {lab.phase === 'ready' ? (
          <Toolbar lab={lab} commands={commands} onOpenNav={() => setNavOpen(true)} />
        ) : (
          <div className="toolbar" />
        )}
        <main id="main" className="content" tabIndex={-1}>
          {lab.phase === 'loading' ? (
            <div className="state-screen" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Loading the C++ core (WebAssembly)…</p>
            </div>
          ) : null}
          {lab.phase === 'error' ? (
            <div className="state-screen state-screen--error" role="alert">
              <h1>The lab stopped</h1>
              <p>
                The Web Lab refused to continue because the simulator boundary could not be trusted. No value is shown
                that could not be validated.
              </p>
              <pre className="mono">{lab.message}</pre>
              <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          ) : null}
          {lab.phase === 'ready' ? (
            <>
              {view === 'machine' ? (
                <MachineView
                  lab={lab}
                  selected={selected}
                  onSelect={setSelected}
                  inspection={inspection}
                  onInspect={setInspection}
                  reducedMotion={reducedMotion}
                  width={addressWidth(lab.client.memorySize)}
                />
              ) : null}
              {view === 'overview' ? <OverviewView lab={lab} onOpenMachine={() => navigate({ view: 'machine' })} /> : null}
              {view === 'experiments' ? (
                <ExperimentsView lab={lab} commands={commands} onOpenMachine={() => navigate({ view: 'machine' })} />
              ) : null}
              {view === 'telemetry' ? <TelemetryView lab={lab} /> : null}
              {view === 'docs' ? <DocsView /> : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

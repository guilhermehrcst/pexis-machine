import {
  BarChartIcon,
  ComponentInstanceIcon,
  CubeIcon,
  DashboardIcon,
  LayersIcon,
  MixIcon,
  ReaderIcon,
  Share2Icon,
  StackIcon,
} from '@radix-ui/react-icons';
import type { ComponentType } from 'react';
import type { ComponentId } from '../scene/transfers';

export type ViewId = 'overview' | 'machine' | 'experiments' | 'telemetry' | 'docs';

export interface NavTarget {
  readonly view: ViewId;
  readonly focus?: ComponentId;
}

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ComponentType<{ 'aria-hidden'?: boolean }>;
  readonly target: NavTarget;
  readonly badge?: string;
  /** A technical identifier (CPU, GPU, Fabric): never machine-translated. */
  readonly term?: boolean;
}

const ITEMS: readonly NavItem[] = [
  { key: 'overview', label: 'Overview', icon: DashboardIcon, target: { view: 'overview' } },
  { key: 'machine', label: 'Machine', icon: CubeIcon, target: { view: 'machine' } },
  { key: 'cpu', label: 'CPU', icon: ComponentInstanceIcon, target: { view: 'machine', focus: 'cpu' }, term: true },
  { key: 'memory', label: 'Memory', icon: StackIcon, target: { view: 'machine', focus: 'ram' } },
  { key: 'gpu', label: 'GPU', icon: LayersIcon, target: { view: 'machine', focus: 'gpu' }, badge: 'Planned', term: true },
  {
    key: 'interconnect',
    label: 'Fabric',
    icon: Share2Icon,
    target: { view: 'machine', focus: 'interconnect' },
    term: true,
  },
  { key: 'experiments', label: 'Experiments', icon: MixIcon, target: { view: 'experiments' } },
  { key: 'telemetry', label: 'Telemetry', icon: BarChartIcon, target: { view: 'telemetry' } },
  { key: 'docs', label: 'Docs', icon: ReaderIcon, target: { view: 'docs' } },
];

interface SidebarProps {
  readonly view: ViewId;
  readonly selected: ComponentId | null;
  readonly open: boolean;
  readonly onNavigate: (target: NavTarget) => void;
  readonly onClose: () => void;
  readonly coreReady: boolean;
}

function isActive(item: NavItem, view: ViewId, selected: ComponentId | null): boolean {
  if (item.target.view !== view) return false;
  if (view !== 'machine') return true;
  return item.target.focus === undefined ? selected === null : item.target.focus === selected;
}

export function Sidebar({ view, selected, open, onNavigate, onClose, coreReady }: SidebarProps) {
  return (
    <>
      <div className={open ? 'scrim is-open' : 'scrim'} onClick={onClose} aria-hidden="true" />
      <nav className={open ? 'sidebar is-open' : 'sidebar'} aria-label="Primary">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand__text">
            <span className="brand__name" translate="no">
              Pexis Machine
            </span>
            <span className="brand__sub">Architecture Lab</span>
          </span>
        </div>

        <ul className="nav">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, view, selected);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={active ? 'nav__item is-active' : 'nav__item'}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.target)}
                  title={item.label}
                >
                  <Icon aria-hidden />
                  <span className="nav__label" translate={item.term ? 'no' : undefined}>
                    {item.label}
                  </span>
                  {item.badge ? <span className="nav__badge">{item.badge}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="sidebar__footer">
          <div className="milestone">
            <span className="milestone__label">Milestone</span>
            <span className="milestone__value">M1 · Visible Machine</span>
          </div>
          <div className={coreReady ? 'core-badge is-ready' : 'core-badge'}>
            <span className="core-badge__dot" aria-hidden="true" />
            {/* Keyed so the state change replaces the element. Updating the
                text node in place freezes on a translated page: translators
                swap text nodes for their own, React then writes to a
                detached node, and "Loading core…" stays on screen. */}
            {coreReady ? (
              <span key="ready" translate="no">
                C++ core · WebAssembly
              </span>
            ) : (
              <span key="loading">Loading core…</span>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

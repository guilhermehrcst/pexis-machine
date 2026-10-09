import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from './Sidebar';
import { METRICS } from './TelemetryPanel';

// Page translators replace text nodes with their own. Two independent
// barriers keep machine state truthful on a translated page: identifiers and
// machine data opt out of translation, and prose that changes with state is
// keyed so React replaces the element rather than writing to a text node the
// translator has detached (which froze "Loading core…" on a ready machine).

function sidebar(coreReady: boolean): string {
  return renderToStaticMarkup(
    createElement(Sidebar, { view: 'machine', selected: null, open: false, onNavigate: () => {}, onClose: () => {}, coreReady }),
  );
}

describe('translation safety', () => {
  it('renders the core badge state as its own element in each state', () => {
    expect(sidebar(false)).toMatch(/<span>Loading core…<\/span>/);
    expect(sidebar(true)).toMatch(/<span translate="no">C\+\+ core · WebAssembly<\/span>/);
    expect(sidebar(true)).not.toContain('Loading core');
  });

  it('keeps component identifiers and the product name out of translation', () => {
    const html = sidebar(true);
    for (const term of ['Pexis Machine', 'CPU', 'GPU', 'Fabric']) {
      expect(html, term).toMatch(new RegExp(`translate="no"[^>]*>${term}<`));
    }
    // Ordinary navigation stays translatable.
    expect(html).toMatch(/<span class="nav__label">Experiments<\/span>/);
  });

  it('marks Loads and Stores as telemetry terms and nothing else', () => {
    expect(METRICS.filter((m) => m.term).map((m) => m.label)).toEqual(['Loads', 'Stores']);
  });
});

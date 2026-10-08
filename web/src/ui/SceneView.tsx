import { useEffect, useRef, useState } from 'react';
import { addressWidth, bytesHuman, hexAddress } from '../machine/format';
import { PACES } from '../machine/runner';
import type { LabReady } from '../machine/useMachineLab';
import { MachineScene } from '../scene/MachineScene';
import { visualizeStep, type ComponentId } from '../scene/transfers';

interface SceneViewProps {
  readonly lab: LabReady;
  readonly selected: ComponentId | null;
  readonly onSelect: (id: ComponentId | null) => void;
  readonly reducedMotion: boolean;
}

const MANUAL_STEP_MS = 900;

export function SceneView({ lab, selected, onSelect, reducedMotion }: SceneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MachineScene | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failure, setFailure] = useState<string | null>(null);
  const memorySize = lab.client.memorySize;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: MachineScene | null = null;
    try {
      const width = addressWidth(memorySize);
      scene = new MachineScene(container, {
        onSelect: (id) => onSelectRef.current(id),
        ramLabel: `${bytesHuman(memorySize)} · linear`,
        formatAddress: (address) => hexAddress(address, width),
      });
      sceneRef.current = scene;
      setFailure(null);
    } catch (error) {
      console.warn('3D view unavailable', error);
      setFailure(error instanceof Error ? error.message : 'WebGL is not available');
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [memorySize]);

  useEffect(() => sceneRef.current?.setSelected(selected), [selected, failure]);
  useEffect(() => sceneRef.current?.setStatus(lab.snapshot.status), [lab.snapshot.status, failure]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion, failure]);
  useEffect(() => {
    const interval = lab.running ? PACES[lab.pace].intervalMs * 0.85 : MANUAL_STEP_MS;
    sceneRef.current?.setStepDuration(interval);
  }, [lab.running, lab.pace, failure]);

  // Animate exactly the events the core reported for the most recent step.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (lab.lastStep === null) {
      scene.clearActivity();
      return;
    }
    scene.play(visualizeStep(lab.lastStep.events));
  }, [lab.lastStep]);

  return (
    <div className="scene" ref={containerRef}>
      {failure ? (
        <div className="scene__fallback" role="status">
          <strong>3D view unavailable</strong>
          <span>WebGL could not start ({failure}). Every control and panel keeps working.</span>
        </div>
      ) : null}
    </div>
  );
}

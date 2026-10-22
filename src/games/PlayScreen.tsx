import { useEffect, useState } from 'react';
import { runtime } from '../app/runtime';
import { InputPanel } from '../device/InputPanel';
import { usePointerKeyboard } from '../device/pointerBindings';
import type { PointerControls } from '../device/PointerInputSource';
import { RemoteControls } from '../sync/broadcast';
import { GameView } from './GameView';
import { audioReady, unlockAudio } from './sound';

/**
 * /play — the trainee's screen. Works in its own window (synced from the
 * therapist window over BroadcastChannel) or in the same tab.
 */
export function PlayScreen() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [soundOk, setSoundOk] = useState(audioReady());
  const [chrome, setChrome] = useState(true);

  // Same tab as the device → drive it directly; otherwise forward to the host window.
  const [local] = useState(() => runtime.getState().status.link === 'connected');
  const [remote] = useState(() => new RemoteControls());
  useEffect(() => (local ? undefined : remote.connect()), [local, remote]);
  const controls: PointerControls | null = local ? runtime.controls : remote;

  usePointerKeyboard(controls, () => setPanelOpen((v) => !v));

  useEffect(() => {
    document.title = 'SmartCore · เกม';
    const unlock = () => {
      unlockAudio();
      setTimeout(() => setSoundOk(audioReady()), 50);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Hide the small corner controls when the mouse is idle.
  useEffect(() => {
    let t = setTimeout(() => setChrome(false), 3000);
    const move = () => {
      setChrome(true);
      clearTimeout(t);
      t = setTimeout(() => setChrome(false), 3000);
    };
    window.addEventListener('pointermove', move);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  return (
    <div className={`fixed inset-0 bg-black ${chrome ? '' : 'cursor-none'}`}>
      <GameView controls={controls} />

      <div className={`absolute bottom-3 left-3 flex gap-2 transition-opacity duration-500 ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {!soundOk && (
          <button
            type="button"
            className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow"
            onClick={() => {
              unlockAudio();
              setTimeout(() => setSoundOk(audioReady()), 50);
            }}
          >
            🔈 แตะเพื่อเปิดเสียง
          </button>
        )}
        <button
          type="button"
          className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen())}
        >
          ⛶ เต็มจอ
        </button>
      </div>

      {controls && <InputPanel controls={controls} open={panelOpen} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}

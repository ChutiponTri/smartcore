import { runtime, useRuntime } from '../app/runtime';

export function EStopButton() {
  const { status } = useRuntime();
  const active = status.pump === 'estop';
  return (
    <button
      type="button"
      onClick={() => void runtime.estop()}
      className={`flex h-14 shrink-0 items-center gap-3 rounded-2xl px-5 text-lg font-bold text-white shadow-lg ring-4 transition-colors ${
        active ? 'bg-red-800 ring-red-300' : 'bg-red-600 ring-red-200 hover:bg-red-700 active:bg-red-800'
      }`}
      aria-label="หยุดฉุกเฉิน"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20" aria-hidden>
        <span className="h-3.5 w-3.5 rounded-sm bg-white" />
      </span>
      หยุดฉุกเฉิน
    </button>
  );
}

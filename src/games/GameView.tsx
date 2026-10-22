import { useEffect, useState } from 'react';
import { pressSurfaceHandlers } from '../device/pointerBindings';
import type { PointerControls } from '../device/PointerInputSource';
import type { GameFrame } from '../sync/broadcast';
import { GameFeed, useFeedFrame } from './feed';
import { GameHost } from './GameHost';
import { PelvisIcon } from './PelvisIcon';
import { playCue } from './sound';

/**
 * Full game screen: Phaser scene + large-type HUD and overlays.
 * Readable from 1–2 m; no mmHg or degree values are ever shown here.
 */
export function GameView({ controls }: { controls: PointerControls | null }) {
  const [feed] = useState(() => new GameFeed());
  useEffect(() => feed.connect(), [feed]);

  return (
    <div
      className="relative h-full w-full touch-none select-none overflow-hidden bg-[#e6f6fd]"
      {...pressSurfaceHandlers(controls)}
    >
      <GameStage feed={feed} />
    </div>
  );
}

function GameStage({ feed }: { feed: GameFeed }) {
  const { frame, live } = useFeedFrame(feed, 12);
  const [showGo, setShowGo] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = feed.onCue((cue) => {
      if (cue === 'go') {
        setShowGo(true);
        clearTimeout(t);
        t = setTimeout(() => setShowGo(false), 1100);
      }
      if (!feed.frame?.muted) playCue(cue);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, [feed]);

  const connected = live && !!frame?.connected;
  const comp = connected ? frame!.compensation : null;

  return (
    <>
      <GameHost gameId={frame?.gameId ?? 'balloon'} feed={feed} />

      {/* Compensation: orange edge glow + pelvis direction icon */}
      <div
        className="pointer-events-none absolute inset-0 transition-[box-shadow] duration-300"
        style={{ boxShadow: comp ? 'inset 0 0 70px 28px rgba(255,159,28,0.8)' : 'inset 0 0 0 0 rgba(255,159,28,0)' }}
      />
      {comp && frame && frame.phase !== 'rest' && (
        <div className="animate-pop absolute left-[2.5%] top-[17%] flex w-[11%] min-w-[90px] flex-col items-center">
          <PelvisIcon comp={comp} obliquity={frame.pelvisObliquity} />
          <span className="mt-1 rounded-full bg-white/90 px-3 py-0.5 text-[clamp(14px,1.6vw,26px)] font-semibold text-[#24415a]">
            ⚠ จัดท่า
          </span>
        </div>
      )}

      {connected && frame && <Hud frame={frame} />}

      {!connected && (
        <Overlay>
          <div className="h-16 w-16 animate-spin rounded-full border-8 border-white/50 border-t-white" />
          <p className="mt-6 text-[clamp(24px,3.4vw,56px)] font-semibold">รอการเชื่อมต่อ</p>
        </Overlay>
      )}

      {connected && frame?.estop && (
        <Overlay>
          <div className="flex gap-4">
            <span className="h-24 w-8 rounded-xl bg-white" />
            <span className="h-24 w-8 rounded-xl bg-white" />
          </div>
          <p className="mt-6 text-[clamp(28px,4vw,64px)] font-semibold">หยุดพักก่อนนะ</p>
        </Overlay>
      )}

      {connected && frame && !frame.estop && (frame.phase === 'idle' || frame.phase === 'ready') && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center">
          <span className="rounded-full bg-white/85 px-8 py-3 text-[clamp(20px,2.6vw,44px)] font-semibold text-[#24415a] shadow-lg">
            เตรียมตัว… รอเริ่มเกม
          </span>
        </div>
      )}

      {connected && frame?.phase === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            key={Math.ceil(frame.remainingSec)}
            className="animate-pop grid aspect-square w-[22%] place-items-center rounded-full bg-white/90 text-[clamp(80px,12vw,220px)] font-bold text-[#24415a] shadow-2xl"
          >
            {Math.max(1, Math.ceil(frame.remainingSec))}
          </span>
        </div>
      )}

      {connected && showGo && frame?.phase === 'hold' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="animate-pop rounded-full bg-white/90 px-14 py-6 text-[clamp(56px,8vw,140px)] font-bold text-[#168f82] shadow-2xl">
            เริ่ม!
          </span>
        </div>
      )}

      {connected && frame?.phase === 'rest' && <RestOverlay seconds={Math.ceil(frame.remainingSec)} />}

      {connected && frame && (frame.phase === 'done' || frame.phase === 'stopped') && (
        <Overlay>
          <div className="flex gap-4 text-[clamp(56px,8vw,140px)] leading-none">
            {[0, 1, 2].map((i) => (
              <span key={i} className="animate-pop text-[#ffc94d] drop-shadow" style={{ animationDelay: `${i * 0.18}s` }}>
                ★
              </span>
            ))}
          </div>
          <p className="mt-4 text-[clamp(40px,5.5vw,96px)] font-bold">{frame.phase === 'done' ? 'เก่งมาก!' : 'พักก่อนนะ'}</p>
          <p className="mt-2 text-[clamp(28px,3.6vw,60px)] font-semibold tabular">★ {frame.score}</p>
        </Overlay>
      )}
    </>
  );
}

function Hud({ frame }: { frame: GameFrame }) {
  const holding = frame.phase === 'hold';
  const rep = Math.max(1, frame.rep);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-[1.6%] text-[#24415a]">
      <Pill>
        รอบ <span className="tabular">{Math.min(rep, frame.totalReps)}/{frame.totalReps}</span>
      </Pill>
      <Pill highlight={holding}>
        <svg viewBox="0 0 24 24" className="h-[1em] w-[1em]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2M9 2h6" />
        </svg>
        <span className="tabular">{holding ? Math.ceil(frame.remainingSec) : '–'}</span>
      </Pill>
      <Pill>
        <span className="text-[#ffb000]">★</span>
        <span className="tabular">{frame.score}</span>
      </Pill>
    </div>
  );
}

function Pill({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <div
      className={`flex items-center gap-[0.4em] rounded-full px-[0.9em] py-[0.25em] text-[clamp(24px,3.2vw,56px)] font-bold shadow-lg ${
        highlight ? 'bg-white ring-4 ring-[#2bb3a3]' : 'bg-white/85'
      }`}
    >
      {children}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#7cc4ea]/90 to-[#bfe6f7]/90 text-white backdrop-blur-sm">
      {children}
    </div>
  );
}

function RestOverlay({ seconds }: { seconds: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#6a7fd0] to-[#c6b6ea] text-white">
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="animate-twinkle absolute rounded-full bg-[#fff6c9]"
          style={{
            left: `${(i * 53) % 100}%`,
            top: `${(i * 29) % 45}%`,
            width: 6 + (i % 3) * 3,
            height: 6 + (i % 3) * 3,
            animationDelay: `${(i % 5) * 0.4}s`,
          }}
        />
      ))}
      <svg viewBox="0 0 1280 200" className="absolute inset-x-0 bottom-0 w-full" preserveAspectRatio="none" aria-hidden>
        <path d="M0 120 Q320 40 640 110 T1280 90 V200 H0Z" fill="#8e86c9" />
        <path d="M0 160 Q300 110 700 150 T1280 140 V200 H0Z" fill="#7a72b8" />
      </svg>
      <div className="relative flex h-full flex-col items-center justify-center">
        <div className="relative grid aspect-square w-[24%] min-w-[160px] place-items-center">
          <span className="animate-breathe absolute inset-0 rounded-full bg-white/25" />
          <span className="animate-breathe absolute inset-[14%] rounded-full bg-white/30" style={{ animationDelay: '0.3s' }} />
          <span className="relative text-[clamp(64px,9vw,160px)] font-bold tabular">{Math.max(0, seconds)}</span>
        </div>
        <p className="mt-6 text-[clamp(28px,3.8vw,64px)] font-semibold">พักสักครู่ หายใจช้า ๆ</p>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Clock, Sparkles, Store } from 'lucide-react';
import { HERO_FRAME_URLS } from '../data/heroFrames';

interface HeroScrollSequenceProps {
  estimatedTime: string;
  onOpenBuilder: () => void;
  onViewMenu: () => void;
}

// Frames 1..225 hold 100% of the pouring, swirl, and fruit explosion motion
// (frames 220..300 are identical final frames).
const ACTIVE_FRAME_URLS = HERO_FRAME_URLS.slice(0, 225);
const TOTAL_FRAMES = ACTIVE_FRAME_URLS.length;

function getUrlHashKey(url: string): string {
  const match = url.match(/_([a-f0-9]+)\.webp$/i);
  return match ? match[1] : url;
}

export const HeroScrollSequence: React.FC<HeroScrollSequenceProps> = ({
  estimatedTime,
  onOpenBuilder,
  onViewMenu,
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [scrollRatio, setScrollRatio] = useState(0);

  const frameImagesRef = useRef<(HTMLImageElement | null)[]>(
    new Array(TOTAL_FRAMES).fill(null)
  );
  const loadedMaskRef = useRef<boolean[]>(new Array(TOTAL_FRAMES).fill(false));
  const lastDrawnIdxRef = useRef<number>(-1);
  const targetFrameRef = useRef<number>(0);
  const currentFrameRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const drawFrameToCanvas = (requestedIdx: number, force = false) => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(requestedIdx)));
    const imgs = frameImagesRef.current;
    const loaded = loadedMaskRef.current;

    let drawIdx = clamped;
    if (!loaded[drawIdx]) {
      let found = -1;
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        if (clamped - offset >= 0 && loaded[clamped - offset]) {
          found = clamped - offset;
          break;
        }
        if (clamped + offset < TOTAL_FRAMES && loaded[clamped + offset]) {
          found = clamped + offset;
          break;
        }
      }
      if (found === -1) return;
      drawIdx = found;
    }

    if (!force && drawIdx === lastDrawnIdxRef.current) return;

    const img = imgs[drawIdx];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const rect = stage.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = width / height;

    let drawW: number;
    let drawH: number;
    if (boxRatio > imgRatio) {
      drawW = width;
      drawH = width / imgRatio;
    } else {
      drawH = height;
      drawW = height * imgRatio;
    }

    const offsetX = (width - drawW) * 0.5;
    const offsetY = (height - drawH) * 0.5;

    ctx.fillStyle = '#2E0A3A';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

    lastDrawnIdxRef.current = drawIdx;
  };

  // Deduplicated, keyframe-first preloader
  useEffect(() => {
    let cancelled = false;

    const hashToIndices = new Map<string, number[]>();
    const uniqueTasks: { url: string; indices: number[] }[] = [];

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const url = ACTIVE_FRAME_URLS[i];
      const key = getUrlHashKey(url);
      const existing = hashToIndices.get(key);
      if (existing) {
        existing.push(i);
      } else {
        const list = [i];
        hashToIndices.set(key, list);
        uniqueTasks.push({ url, indices: list });
      }
    }

    const priorityTaskSet = new Set<number>();
    const orderedTasks: { url: string; indices: number[] }[] = [];

    const addTaskContaining = (frameIdx: number) => {
      const tIdx = uniqueTasks.findIndex((t) => t.indices.includes(frameIdx));
      if (tIdx !== -1 && !priorityTaskSet.has(tIdx)) {
        priorityTaskSet.add(tIdx);
        orderedTasks.push(uniqueTasks[tIdx]);
      }
    };

    // Pass 0: first & last frames immediately
    addTaskContaining(0);
    addTaskContaining(TOTAL_FRAMES - 1);
    // Pass 1: ~28 evenly distributed keyframes so scrubbing works across the whole video right away
    for (let i = 0; i < TOTAL_FRAMES; i += 8) {
      addTaskContaining(i);
    }
    // Pass 2: every remaining frame for 60fps smoothness
    uniqueTasks.forEach((task, idx) => {
      if (!priorityTaskSet.has(idx)) {
        orderedTasks.push(task);
      }
    });

    let completedUnique = 0;
    const totalUnique = orderedTasks.length;
    let cursor = 0;
    const CONCURRENCY = 8;

    const loadTask = (task: { url: string; indices: number[] }) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = 'async';

        const finish = (ok: boolean) => {
          if (cancelled) {
            resolve();
            return;
          }
          if (ok) {
            for (const frameIdx of task.indices) {
              frameImagesRef.current[frameIdx] = img;
              loadedMaskRef.current[frameIdx] = true;
            }
            if (task.indices.includes(0)) {
              setFirstFrameReady(true);
              drawFrameToCanvas(Math.round(targetFrameRef.current), true);
            } else {
              const current = Math.round(currentFrameRef.current);
              if (!loadedMaskRef.current[current] || task.indices.includes(current)) {
                drawFrameToCanvas(current, false);
              }
            }
          }
          completedUnique++;
          setLoadProgress(Math.round((completedUnique / totalUnique) * 100));
          resolve();
        };

        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = task.url;
      });

    const runWorker = async () => {
      while (!cancelled && cursor < orderedTasks.length) {
        const idx = cursor++;
        await loadTask(orderedTasks[idx]);
      }
    };

    const start = async () => {
      if (orderedTasks.length > 0) {
        cursor = 1;
        await loadTask(orderedTasks[0]);
      }
      if (cancelled) return;
      const workers = Array.from({ length: CONCURRENCY }, () => runWorker());
      await Promise.all(workers);
    };

    start();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep canvas crisp on resize / mobile orientation change
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const ro = new ResizeObserver(() => {
      drawFrameToCanvas(Math.round(currentFrameRef.current), true);
    });
    ro.observe(stage);

    return () => ro.disconnect();
  }, []);

  // Scroll + touch scrubbing (always moves when user scrolls down)
  useEffect(() => {
    const stepAnimation = () => {
      const diff = targetFrameRef.current - currentFrameRef.current;
      if (reducedMotion || Math.abs(diff) < 0.08) {
        currentFrameRef.current = targetFrameRef.current;
        drawFrameToCanvas(Math.round(currentFrameRef.current));
        rafRef.current = null;
        return;
      }
      currentFrameRef.current += diff * 0.28;
      drawFrameToCanvas(Math.round(currentFrameRef.current));
      rafRef.current = requestAnimationFrame(stepAnimation);
    };

    const computeScrollTarget = () => {
      const container = containerRef.current;
      const stage = stageRef.current;
      if (!container || !stage) return;

      const stickyTop = window.innerWidth >= 640 ? 72 : 64;
      const rect = container.getBoundingClientRect();
      const scrollableDistance = Math.max(1, container.offsetHeight - stage.offsetHeight);
      const traveled = stickyTop - rect.top;
      const ratio = Math.max(0, Math.min(1, traveled / scrollableDistance));

      setScrollRatio(ratio);
      targetFrameRef.current = ratio * (TOTAL_FRAMES - 1);

      if (reducedMotion) {
        currentFrameRef.current = targetFrameRef.current;
        drawFrameToCanvas(Math.round(currentFrameRef.current));
      } else if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(stepAnimation);
      }
    };

    computeScrollTarget();
    window.addEventListener('scroll', computeScrollTarget, { passive: true });
    document.addEventListener('scroll', computeScrollTarget, { passive: true, capture: true });
    window.addEventListener('touchmove', computeScrollTarget, { passive: true });
    window.addEventListener('resize', computeScrollTarget, { passive: true });

    return () => {
      window.removeEventListener('scroll', computeScrollTarget);
      document.removeEventListener('scroll', computeScrollTarget, { capture: true });
      window.removeEventListener('touchmove', computeScrollTarget);
      window.removeEventListener('resize', computeScrollTarget);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [reducedMotion]);

  return (
    <section
      ref={containerRef}
      aria-label="Banner animado Tropicália Açaí"
      className="relative w-full bg-[#2E0A3A] h-[270vh] sm:h-[310vh]"
    >
      <div
        ref={stageRef}
        className="sticky top-16 sm:top-[72px] h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-72px)] w-full overflow-hidden bg-[#2E0A3A]"
      >
        {/* Fullscreen responsive Canvas */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full block"
        />

        {/* Moderate dark tint overlay ("um pouco escuro mas não muito") */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[#1B0524]/35"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1B0524]/75 via-[#1B0524]/15 to-[#1B0524]/30"
        />

        {/* Loading pill before first frame paints */}
        {!firstFrameReady && (
          <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-[#2E0A3A]/75 text-[#FFF4DC] text-xs font-bold backdrop-blur-sm">
            Carregando animação {loadProgress}%
          </div>
        )}

        {/* Clean, unboxed typography & CTAs directly over the slightly darkened scene */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-10 flex flex-col justify-between pointer-events-none">
          {/* Top eyebrow */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#F7B518] tracking-wide drop-shadow-[0_2px_8px_rgba(18,3,24,0.85)] pointer-events-auto">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Mais de 3 anos de Tropicália Açaí</span>
            </div>

            {loadProgress < 100 && firstFrameReady && (
              <div className="hidden sm:inline-flex items-center gap-2 text-[11px] font-bold text-[#FFF4DC]/85 drop-shadow-[0_1px_6px_rgba(18,3,24,0.85)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />
                Carregando HD {loadProgress}%
              </div>
            )}
          </div>

          {/* Bottom unboxed hero text + actions + scroll cue */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div className="pointer-events-auto max-w-xl space-y-3 sm:space-y-4">
              <h1 className="font-display font-extrabold text-[30px] sm:text-5xl lg:text-[54px] leading-[1.05] tracking-tight text-[#FFF4DC] [text-wrap:balance] drop-shadow-[0_3px_14px_rgba(18,3,24,0.9)]">
                Monte o seu açaí do jeito que você ama.
              </h1>

              <p className="text-sm sm:text-lg text-[#FFF4DC]/95 max-w-lg leading-relaxed drop-shadow-[0_2px_10px_rgba(18,3,24,0.9)]">
                Escolha cada camada, acompanhe o pedido ao vivo e receba em casa em{' '}
                <span className="font-extrabold text-[#F7B518]">{estimatedTime}</span>.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onOpenBuilder}
                  className="group min-h-[48px] sm:min-h-[54px] px-6 sm:px-7 rounded-full bg-gradient-to-r from-[#F7B518] to-[#FFD45C] text-[#2E0A3A] font-display font-extrabold text-sm sm:text-base shadow-xl shadow-black/35 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  Montar meu açaí
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={onViewMenu}
                  className="min-h-[48px] sm:min-h-[54px] px-5 sm:px-6 rounded-full bg-[#2E0A3A]/70 hover:bg-[#4A1259]/90 border border-[#FFF4DC]/30 text-[#FFF4DC] font-display font-bold text-sm sm:text-base backdrop-blur-sm shadow-lg transition-colors cursor-pointer"
                >
                  Ver cardápio completo
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs sm:text-sm font-semibold text-[#FFF4DC]/90 drop-shadow-[0_2px_8px_rgba(18,3,24,0.9)]">
                <span className="inline-flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F7B518]" />
                  Mais de 3 anos de sabor
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F7B518]" />
                  Acompanhe ao vivo
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F7B518]" />
                  Pague com Pix
                </span>
              </div>
            </div>

            {/* Scroll prompt indicator */}
            <div
              className={`self-start lg:self-end inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#FFF4DC] drop-shadow-[0_2px_8px_rgba(18,3,24,0.9)] transition-opacity duration-300 ${
                scrollRatio > 0.88 ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <span>
                {scrollRatio < 0.08
                  ? 'Role para baixo'
                  : `${Math.round(scrollRatio * 100)}%`}
              </span>
              <ArrowDown
                className={`w-4 h-4 text-[#F7B518] ${
                  reducedMotion ? '' : 'animate-bounce'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

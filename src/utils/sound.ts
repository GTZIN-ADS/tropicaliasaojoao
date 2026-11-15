// Shared Web Audio chime utility for real-time Admin & Customer panel alerts.
// Keeps AudioContext unlocked automatically on the user's first interaction.

let sharedAudioCtx: AudioContext | null = null;
let listenersBound = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  if (typeof window !== 'undefined' && !listenersBound) {
    listenersBound = true;
    const resume = () => {
      const c = getAudioContext();
      if (c && c.state === 'suspended') {
        c.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('touchstart', resume, { passive: true });
    window.addEventListener('keydown', resume, { passive: true });
  }
}

function playNotes(notes: number[], stepSec = 0.11, durationSec = 0.34, volume = 0.24): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const baseTime = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = baseTime + idx * stepSec;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + durationSec + 0.02);
    });
  } catch {
    // Ignore if browser blocks audio before first gesture
  }
}

export function playAdminUpdateSound(
  kind: 'new_order' | 'order_update' | 'catalog_update' = 'order_update'
): void {
  if (kind === 'new_order') {
    // Bright 3-note bell chime for incoming order
    playNotes([523.25, 659.25, 783.99, 1046.5], 0.09, 0.36, 0.26);
  } else if (kind === 'order_update') {
    // Crisp 2-note chime for any order update (Pix receipt, status change, etc.)
    playNotes([587.33, 880], 0.1, 0.28, 0.22);
  } else {
    // Soft confirmation chime for catalog/settings update
    playNotes([659.25, 783.99], 0.09, 0.24, 0.18);
  }
}

export function playCustomerUpdateSound(): void {
  // Pleasant 2-note tropical chime for customer order/menu updates
  playNotes([659.25, 987.77], 0.1, 0.32, 0.24);
}

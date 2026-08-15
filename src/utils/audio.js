/**
 * GeoGuessr Explorer — Sistema de Efectos de Sonido (SFX)
 * Sintetizados mediante Web Audio API (0 assets externos, 0ms latencia)
 */

let audioCtx = null;
let warmDone = false;

async function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (e) {
      console.warn('Audio resume failed:', e);
    }
  }
  return audioCtx;
}

/** Pre-inicializar el contexto de audio en la primera interacción del usuario */
export async function warmupAudio() {
  try {
    const ctx = await getAudioContext();
    if (ctx && !warmDone) {
      warmDone = true;
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      src.stop(ctx.currentTime + 0.001);
    }
  } catch (e) {
    console.warn('Audio warmup error:', e);
  }
}

function playSound(buildSound) {
  try {
    getAudioContext().then((ctx) => {
      if (!ctx) return;
      buildSound(ctx);
    });
  } catch (e) {
    console.warn('Audio SFX error:', e);
  }
}

/** Sonido suave de colocacion de pin en el minimapa */
export function playPinDropSFX() {
  playSound((ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  });
}

/** Sonido de Tic-Tac para la cuenta regresiva de Panico */
export function playTickSFX(isUrgent = false) {
  playSound((ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isUrgent ? 'sawtooth' : 'triangle';
    const freq = isUrgent ? 880 : 440;

    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(isUrgent ? 0.3 : 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  });
}

/** Sonido de impacto al recibir danio en Duels */
export function playDamageSFX() {
  playSound((ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  });
}

/** Sonido de victoria — fanfarria ascendente para el ganador de ronda en Duels */
export function playVictorySFX() {
  playSound((ctx) => {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.08 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.2);
    });
  });
}

/** Fanfarria / Sonido de K.O. al terminar la partida */
export function playKOSFX() {
  playSound((ctx) => {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);

      gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.1 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.3);
    });
  });
}

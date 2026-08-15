let audioContext = null;
let masterGain = null;
let musicTimer = null;
let users = 0;
let stopTimer = null;
let step = 0;

const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
const chords = [130.81, 146.83, 164.81, 146.83];

function playTone(frequency, duration, delay, type = 'sine', volume = 0.08) {
  if (!audioContext || !masterGain) return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

function schedulePhrase() {
  const melodyNote = melody[step % melody.length];
  const bassNote = chords[Math.floor(step / 2) % chords.length];
  playTone(melodyNote, 1.25, 0, 'sine', 0.055);
  playTone(melodyNote / 2, 2.2, 0, 'triangle', 0.025);
  if (step % 2 === 0) playTone(bassNote, 2.8, 0, 'sine', 0.035);
  step += 1;
}

export function startMenuMusic() {
  users += 1;
  if (stopTimer) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }

  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
       masterGain.gain.value = 0.6;
      masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    if (!musicTimer) {
      schedulePhrase();
      musicTimer = window.setInterval(schedulePhrase, 1400);
    }
  } catch (error) {
    console.warn('La música del menú no está disponible:', error);
  }
}

export function resumeMenuMusic() {
  if (audioContext?.state === 'suspended') audioContext.resume();
}

export function stopMenuMusic() {
  users = Math.max(0, users - 1);
  if (users > 0 || stopTimer) return;
  stopTimer = window.setTimeout(() => {
    if (users > 0) return;
    if (musicTimer) window.clearInterval(musicTimer);
    musicTimer = null;
    audioContext?.close();
    audioContext = null;
    masterGain = null;
    stopTimer = null;
  }, 300);
}

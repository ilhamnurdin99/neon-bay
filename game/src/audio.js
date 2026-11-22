// All sound is synthesized with WebAudio: no audio files, no network. The engine is a low
// sawtooth whose pitch follows the car's speed, the siren alternates two tones, and the rest
// are short bursts of filtered noise or sine blips. Audio starts only after a user gesture.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenOn = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  /** Call from any user gesture (click or key) so the browser lets sound start. */
  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function noiseBurst(duration, filterFreq, volume) {
    if (!ensure() || muted) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function blip(freq, duration, volume, type = 'sine', when = 0) {
    if (!ensure() || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master !== null) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Engine hum follows the player's car speed (0 when on foot). */
    setEngine(speed, maxSpeed) {
      if (!ensure() || muted) {
        if (engineGain !== null) engineGain.gain.value = 0;
        return;
      }
      const ratio = Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed));
      engineOsc.frequency.value = 52 + ratio * 130;
      engineGain.gain.setTargetAtTime(0.02 + ratio * 0.05, context.currentTime, 0.08);
    },
    /** The siren wails while any police car is near; its tone alternates by the clock. */
    setSiren(active, time) {
      sirenOn = active;
      if (!ensure()) return;
      if (!active || muted) {
        sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        return;
      }
      sirenOsc.frequency.value = Math.floor(time * 2.4) % 2 === 0 ? 720 : 960;
      sirenGain.gain.setTargetAtTime(0.035, context.currentTime, 0.1);
    },
    get sirenOn() {
      return sirenOn;
    },
    gunshot() {
      noiseBurst(0.14, 2400, 0.5);
      blip(140, 0.12, 0.3, 'square');
    },
    punch() {
      noiseBurst(0.09, 500, 0.4);
    },
    crash(strength) {
      noiseBurst(0.25, 900, Math.min(0.6, 0.2 + strength * 0.4));
    },
    pickup() {
      blip(660, 0.09, 0.25);
      blip(880, 0.14, 0.25, 'sine', 0.08);
    },
    cash() {
      blip(990, 0.08, 0.22);
      blip(1320, 0.12, 0.22, 'sine', 0.07);
    },
    missionDone() {
      blip(523, 0.12, 0.3);
      blip(659, 0.12, 0.3, 'sine', 0.11);
      blip(784, 0.2, 0.3, 'sine', 0.22);
    },
    missionFail() {
      blip(392, 0.16, 0.3, 'sawtooth');
      blip(311, 0.28, 0.3, 'sawtooth', 0.15);
    },
    busted() {
      blip(220, 0.3, 0.3, 'sawtooth');
      blip(185, 0.5, 0.3, 'sawtooth', 0.28);
    },
    click() {
      blip(520, 0.05, 0.18);
    },
  };
}

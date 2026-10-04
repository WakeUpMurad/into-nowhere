export class AmbientMusic {
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private epoch = 0;
  private index = 0;
  private pending: Promise<boolean> | null = null;
  private wantsPlaying = false;

  get isPlaying(): boolean { return this.audio?.state === 'running' && this.timer !== null; }

  play(): Promise<boolean> {
    if (document.hidden) return Promise.resolve(false);
    if (this.isPlaying) return Promise.resolve(true);
    if (this.pending) return this.pending;
    const epoch = ++this.epoch;
    this.wantsPlaying = true;
    const start = async () => {
      try {
        if (!this.audio) this.create();
        const audio = this.audio!;
        await audio.resume();
        if (epoch !== this.epoch || audio !== this.audio || document.hidden) {
          // A late resume must not revive music after an explicit pause.
          if (audio === this.audio && !this.wantsPlaying) void audio.suspend().catch(() => {});
          return false;
        }
        if (audio.state !== 'running') throw new Error('Audio unavailable');
        const gain = this.master!.gain, time = audio.currentTime;
        gain.cancelScheduledValues(time); gain.setValueAtTime(gain.value, time); gain.linearRampToValueAtTime(.65, time + 1);
        if (!this.timer) { this.note(); this.timer = setInterval(() => this.note(), 3200); }
        return true;
      } catch (error) {
        if (epoch !== this.epoch) return false;
        this.pause();
        throw error;
      }
    };
    const pending = start();
    this.pending = pending;
    const clearPending = () => { if (this.pending === pending) this.pending = null; };
    void pending.then(clearPending, clearPending);
    return pending;
  }

  pause(): void {
    this.epoch++;
    this.wantsPlaying = false;
    this.pending = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.audio && this.audio.state !== 'closed') {
      this.master?.gain.cancelScheduledValues(this.audio.currentTime);
      this.master?.gain.setValueAtTime(0, this.audio.currentTime);
      void this.audio.suspend().catch(() => {});
    }
  }

  close(): void { this.pause(); void this.audio?.close().catch(() => {}); this.audio = null; this.master = null; }
  chime(): void { if (this.audio?.state === 'running') this.bell(587.33, .06); }

  private note(): void {
    if (!this.audio || this.audio.state !== 'running' || document.hidden) return;
    const notes = [587.33,739.99,880,659.25,440,739.99,587.33,1108.73];
    this.bell(notes[this.index++ % notes.length], .025);
  }

  private bell(frequency: number, volume: number): void {
    const audio = this.audio!, time = audio.currentTime + .02;
    [1,2.002,3.001].forEach((ratio, index) => {
      const tone = audio.createOscillator(), gain = audio.createGain();
      tone.type = 'sine'; tone.frequency.value = frequency * ratio;
      gain.gain.setValueAtTime(.0001,time); gain.gain.exponentialRampToValueAtTime(volume / (index*3+1),time+.018); gain.gain.exponentialRampToValueAtTime(.0001,time+4.6-index*.5);
      tone.connect(gain); gain.connect(this.master!); tone.start(time); tone.stop(time+5);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    });
  }

  private create(): void {
    const Audio = window.AudioContext || (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!Audio) throw new Error('Audio unavailable');
    const audio = this.audio = new Audio();
    const master = this.master = audio.createGain(); master.gain.value = 0;
    const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2100; master.connect(filter); filter.connect(audio.destination);
    const delay = audio.createDelay(2), feedback = audio.createGain(), wet = audio.createGain();
    delay.delayTime.value = .68; feedback.gain.value = .26; wet.gain.value = .22;
    filter.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(audio.destination);
    [146.83,220,293.66,369.99].forEach((frequency, index) => {
      const tone = audio.createOscillator(), gain = audio.createGain(), lfo = audio.createOscillator(), depth = audio.createGain();
      tone.type = index%2 ? 'sine' : 'triangle'; tone.frequency.value = frequency; tone.detune.value = index%2 ? 3 : -3;
      gain.gain.value = .025/(1+index*.55); lfo.frequency.value = .07+index*.014; depth.gain.value = .009;
      lfo.connect(depth); depth.connect(gain.gain); tone.connect(gain); gain.connect(master); tone.start(); lfo.start();
    });
  }
}

// One output context and one live voice per cue, matching the native mixer.
// Buffers are prepared when Rust loads a sound, never during a judgment frame.
(() => {
  class PadviewAudio {
    constructor(createContext = () => new AudioContext({ latencyHint: 'interactive' })) {
      this.createContext = createContext;
      this.buffers = new Map();
      this.voices = new Map();
      this.allVoices = new Set();
      this.media = new WeakMap();
      this.clock = null;
      this.needsReset = true;
      this.enabled = true; this.musicGain = 1; this.mediaGains = new Set();
    }
    context() {
      if (!this.output) {
        this.output = this.createContext();
        this.input = this.output.createGain();
        this.input.gain.value = this.enabled ? 1 : 0;
        this.input.connect(this.output.destination);
      }
      return this.output;
    }
    register(id, samples, channels, rate) {
      if (!channels || !rate || !samples.length) return;
      const context = this.context();
      const buffer = context.createBuffer(channels, Math.floor(samples.length / channels), rate);
      for (let channel = 0; channel < channels; channel++) {
        const target = buffer.getChannelData(channel);
        for (let i = 0; i < target.length; i++) target[i] = samples[i * channels + channel];
      }
      this.buffers.set(id, buffer);
    }
    release(id) { this.buffers.delete(id); }
    setPreferences(params) {
      this.enabled = params.player_audio_enabled !== false;
      this.musicGain = Math.max(0, Math.min(1, params.music_volume ?? 1));
      if (params.sdez?.enabled && params.sdez.headphone_mode) {
        this.musicGain *= ((params.sdez.values?.HeadPhoneVolume ?? 9) + 1) / 20;
      }
      if (this.input) this.input.gain.value = this.enabled ? 1 : 0;
      for (const gain of this.mediaGains) gain.gain.value = this.musicGain;
      if (!this.enabled) this.stop();
    }
    // With a MediaElementSource, a suspended output can freeze currentTime
    // even with readyState=4, paused=false and no media waiting/pause event.
    watchPlayback(media, active, interrupt) {
      let recovery = null, last = null, since = 0, sampled = 0, started = false;
      const reset = () => { recovery = null; last = null; sampled = 0; started = false; };
      const onPlaying = () => { started = active(); };
      media.addEventListener('playing', onPlaying);
      const report = reason => {
        console.warn('[Padview 播放]', reason, {musicTime:media.currentTime, audioState:this.output?.state,
          readyState:media.readyState, paused:media.paused, buffered:Array.from({length:media.buffered.length},
            (_,i)=>[media.buffered.start(i),media.buffered.end(i)])});
        reset();
        interrupt(reason + '，点播放从这里继续。');
      };
      const check = () => {
        if (document.hidden || !active() || media.ended || media.seeking || !this.output) { reset(); return; }
        if (!media.paused && media.readyState >= 3) started = true;
        if (!started) return;
        const now = performance.now(), time = media.currentTime, state = this.output.state;
        if (last === null || time !== last || now - sampled > 2000) since = now;
        last = time; sampled = now;
        if (media.paused) {
          if (now - since >= 750) report('浏览器暂停了音乐');
        } else if (state === 'suspended' || state === 'interrupted') {
          if (!recovery) {
            const attempt = recovery = {at:now, denied:false};
            this.output.resume().catch(() => { attempt.denied = true; });
          } else if (recovery.denied || now - recovery.at >= 1500) report('设备中断了音频输出');
        } else {
          recovery = null;
          if (media.readyState < 3) since = now; // streaming: let the media element rebuffer
          else if (now - since >= 4000) report('音乐时钟已停止');
        }
      };
      const timer = setInterval(check,250);
      return () => { clearInterval(timer); media.removeEventListener('playing', onPlaying); reset(); };
    }
    async unlock(media) {
      const context = this.context();
      // Music and hit cues share an output pipeline instead of unrelated
      // HTML-media and WebAudio device buffers.
      if (media && !this.media.has(media)) {
        const source = context.createMediaElementSource(media);
        const gain = context.createGain(); gain.gain.value = this.musicGain;
        source.connect(gain); gain.connect(this.input); this.mediaGains.add(gain);
        this.media.set(media, source);
        media.addEventListener('waiting', () => {
          if (media.paused || media.seeking || media.ended || !media.currentTime) return;
          console.warn('[Padview 播放] 正在等待音乐缓冲', {musicTime:media.currentTime,
            readyState:media.readyState, buffered:Array.from({length:media.buffered.length}, (_,i) =>
              [media.buffered.start(i),media.buffered.end(i)])});
        });
      }
      let resume;
      if (context.state !== 'running') {
        resume = context.resume();
        if (media) {
          // A gesture can still be denied without resolving or rejecting resume().
          // Give transport controls back to the host so the listener can retry.
          let timer;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('音频输出尚未恢复，请再次点播放。')), 4000);
          });
          resume = Promise.race([resume, timeout]).finally(() => clearTimeout(timer));
        }
      }
      // No lookahead is introduced by this sample-by-sample
      // limiter. It prevents answer + Hold head/tail cues from clipping.
      this.mixerReady ||= (async () => {
        let mixer;
        if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
          await context.audioWorklet.addModule(new URL('mixer-worklet.js?v=1', globalThis.padviewHost ? new URL('/padview/',location.href) : document.baseURI));
          mixer = new AudioWorkletNode(context, 'padview-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        } else if (context.createDynamicsCompressor) {
          mixer = context.createDynamicsCompressor();
          mixer.threshold.value = -0.45; mixer.knee.value = 0; mixer.ratio.value = 20;
          mixer.attack.value = 0; mixer.release.value = 0.05;
        }
        if (mixer) { this.input.disconnect(); this.input.connect(mixer); mixer.connect(context.destination); this.mixer = mixer; }
      })();
      await Promise.all([resume, this.mixerReady]);
    }
    play(id, gain, offset = 0, duration = Infinity, speed = 1, bus = 0) {
      return this.start(id, gain, offset, duration, speed, bus, this.output?.currentTime, false);
    }
    setTransport(time, playing, sentAt, seek = false, source, boundary, rate = 1) {
      if (!playing || !this.output || this.output.state !== 'running') {
        this.pausedTime = time; this.clock = null; this.stop(); return;
      }
      const stamp = typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : 0;
      const age = Number.isFinite(sentAt) ? Math.max(0, Math.min(0.2, (stamp - sentAt) / 1000)) : 0;
      rate = Number.isFinite(rate) && rate >= 0.5 && rate <= 2 ? rate : 1;
      const chart = time + age * rate, current = this.time();
      // Keep one audio-clock anchor through ordinary display-frame jitter.
      // A seek, pause, buffering or substantial drift creates a fresh epoch.
      if (current === null || seek || this.clock.source !== source || this.clock.rate !== rate || Math.abs(current - chart) > 0.04) {
        this.stop(3);
        const start = current === null && this.pausedTime <= time ? this.pausedTime : time;
        this.clock = { chart, start, context: this.output.currentTime, source, rate, boundary: Number.isFinite(boundary) ? boundary : Infinity };
      }
      this.pausedTime = undefined;
    }
    time() {
      return this.clock && this.output?.state === 'running'
        ? Math.min(this.clock.boundary, this.clock.chart + (this.output.currentTime - this.clock.context) * this.clock.rate) : null;
    }
    pause() { this.clock = null; this.stop(); }
    schedule(id, gain, at, offset, duration, speed) {
      if (!this.clock || !this.output) return false;
      const when = this.clock.context + (at - this.clock.chart) / this.clock.rate;
      // A stalled tab must not release a burst of old judgments on resuming.
      if (when < this.output.currentTime - 0.03) return false;
      return this.start(id, gain, offset, duration / this.clock.rate, speed * this.clock.rate, 3, Math.max(this.output.currentTime, when), true);
    }
    start(id, gain, offset, duration, speed, bus, when, scheduled) {
      const context = this.output, buffer = this.buffers.get(id);
      // Never queue a stale judgment while waiting for browser permission.
      // The parent's Play gesture unlocks the context before advancing time.
      if (!this.enabled || !context || context.state !== 'running' || !buffer || !(gain > 0)
          || !Number.isFinite(offset) || offset < 0 || !(duration > 0) || !(speed > 0)) return false;
      const key = `${bus}:${id}`;
      if (!scheduled) this.stopVoice(key);
      const length = Math.min(buffer.duration - offset, duration * speed);
      if (!(length > 0)) return false;
      const source = context.createBufferSource(), volume = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = speed;
      volume.gain.value = Math.max(0, Math.min(1, gain));
      source.connect(volume); volume.connect(this.input);
      if (scheduled) {
        for (const previous of this.allVoices) {
          if (previous.key === key && previous.when <= when && previous.until > when) {
            previous.source.stop(when); previous.until = when;
          }
        }
      }
      const voice = { source, volume, bus, key, when, until: when + length / speed };
      this.allVoices.add(voice);
      this.voices.set(key, voice);
      source.onended = () => {
        source.disconnect(); volume.disconnect();
        this.allVoices.delete(voice);
        if (this.voices.get(key) === voice) this.voices.delete(key);
      };
      source.start(when, offset, length);
      return true;
    }
    stopVoice(key) {
      for (const voice of this.allVoices) if (voice.key === key) this.removeVoice(voice);
    }
    removeVoice(voice) {
      this.allVoices.delete(voice);
      if (this.voices.get(voice.key) === voice) this.voices.delete(voice.key);
      voice.source.onended = null;
      voice.source.stop(); voice.source.disconnect(); voice.volume.disconnect();
    }
    stop(bus) {
      for (const voice of this.allVoices) if (bus === undefined || voice.bus === bus) this.removeVoice(voice);
      if (bus === undefined || bus === 3) this.needsReset = true;
    }
  }
  globalThis.PadviewAudio = PadviewAudio;
})();

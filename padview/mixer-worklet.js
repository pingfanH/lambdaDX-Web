// Immediate stereo peak protection with 50 ms release, without lookahead delay.
class PadviewLimiter extends AudioWorkletProcessor {
  constructor() { super(); this.gain = 1; }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!output?.length) return true;
    const left = input?.[0], right = input?.[1] || left;
    for (let i = 0; i < output[0].length; i++) {
      const l = left?.[i] || 0, r = right?.[i] || 0;
      const target = Math.min(1, 0.95 / Math.max(0.95, Math.abs(l), Math.abs(r)));
      this.gain = Math.min(target, this.gain + (1 - this.gain) / (sampleRate * 0.05));
      output[0][i] = l * this.gain;
      if (output[1]) output[1][i] = r * this.gain;
    }
    return true;
  }
}
registerProcessor('padview-limiter', PadviewLimiter);

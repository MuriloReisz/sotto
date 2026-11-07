// AudioWorklet: runs on the browser's audio thread. Downsamples whatever the device
// delivers (usually 48 kHz) to 16 kHz mono, the format speech recognition uses, and
// posts it to the page in 100 ms blocks. Plain JS because worklets load as separate
// files and are not bundled.

const TARGET_RATE = 16000
const BLOCK = 1600 // 100 ms at 16 kHz

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / TARGET_RATE // `sampleRate` is a worklet global
    this.phase = 0
    this.sum = 0
    this.count = 0
    this.out = new Float32Array(BLOCK)
    this.n = 0
  }

  process(inputs) {
    // An input with no channels (a muted or silent track) still counts as silence, so the
    // page keeps getting blocks and can tell "nothing arrives" from "the engine stopped".
    const channels = inputs[0] || []
    const frames = channels.length > 0 ? channels[0].length : 128 // 128 = one render quantum
    for (let i = 0; i < frames; i++) {
      // Mix down to mono.
      let v = 0
      for (let c = 0; c < channels.length; c++) v += channels[c][i]
      this.sum += channels.length > 0 ? v / channels.length : 0
      this.count++
      // Average every `ratio` input samples into one output sample (a simple low-pass).
      this.phase += 1
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio
        this.out[this.n++] = this.sum / this.count
        this.sum = 0
        this.count = 0
        if (this.n === BLOCK) {
          this.port.postMessage(this.out.slice(0))
          this.n = 0
        }
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)

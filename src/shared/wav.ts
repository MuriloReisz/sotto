/** Wrap raw 16-bit mono PCM in a minimal WAV header (what whisper-server accepts). */
export function pcm16ToWav(pcm: Uint8Array, sampleRate = 16_000): Uint8Array {
  const header = new DataView(new ArrayBuffer(44))
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  header.setUint32(4, 36 + pcm.byteLength, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  header.setUint32(16, 16, true) // fmt chunk size
  header.setUint16(20, 1, true) // PCM
  header.setUint16(22, 1, true) // mono
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true) // byte rate
  header.setUint16(32, 2, true) // block align
  header.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  header.setUint32(40, pcm.byteLength, true)
  const out = new Uint8Array(44 + pcm.byteLength)
  out.set(new Uint8Array(header.buffer), 0)
  out.set(pcm, 44)
  return out
}

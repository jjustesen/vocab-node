import { Mp3Encoder } from 'npm:@breezystack/lamejs@1.2.7'

/**
 * WAV (PCM 16-bit mono, como sai de `falarInteiro`) → MP3 de 64 kbps.
 *
 * As falas pré-gravadas são baixadas pela página do aluno no celular: o WAV
 * pesa ~10x mais. É a mesma conversão do scripts/wav-para-mp3.py (lameenc),
 * agora dentro da função, para o botão "Gerar áudios" do editor.
 */
export function wavParaMp3(wav: Uint8Array): Uint8Array {
  const vista = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  // O WAV de falar.ts tem sempre o cabeçalho canônico de 44 bytes (pcmParaWav).
  const taxa = vista.getUint32(24, true)
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength - ((wav.byteLength - 44) % 2)))

  const codificador = new Mp3Encoder(1, taxa, 64)
  // O lamejs devolve Int8Array: os mesmos bytes, lidos sem sinal.
  const bytes = (p: Int8Array) => new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
  const partes: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += 1152) partes.push(bytes(codificador.encodeBuffer(pcm.subarray(i, i + 1152))))
  partes.push(bytes(codificador.flush()))

  const total = partes.reduce((n, p) => n + p.length, 0)
  const mp3 = new Uint8Array(total)
  let o = 0
  for (const p of partes) {
    mp3.set(p, o)
    o += p.length
  }
  return mp3
}

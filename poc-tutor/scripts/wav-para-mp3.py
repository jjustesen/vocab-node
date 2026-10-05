"""WAV (PCM 16-bit mono) -> MP3 de 64 kbps, apagando o WAV. Chamado por
gravar-falas.ts: o WAV da aula pesa ~10x mais e a página baixa estes arquivos.

    python scripts/wav-para-mp3.py web/audios
"""
import pathlib, sys, wave

import lameenc

pasta = pathlib.Path(sys.argv[1])
for wav in sorted(pasta.glob('*.wav')):
    with wave.open(str(wav)) as w:
        enc = lameenc.Encoder()
        enc.set_bit_rate(64)
        enc.set_in_sample_rate(w.getframerate())
        enc.set_channels(w.getnchannels())
        enc.set_quality(2)
        mp3 = enc.encode(w.readframes(w.getnframes())) + enc.flush()
    wav.with_suffix('.mp3').write_bytes(mp3)
    wav.unlink()
    print(f'{wav.stem}.mp3  {len(mp3) // 1024} KB')

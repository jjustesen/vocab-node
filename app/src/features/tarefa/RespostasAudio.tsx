import { useRef, useState } from 'react'
import { AlertTriangle, Loader2, Volume2 } from 'lucide-react'

/**
 * Toca o áudio pré-gerado da frase (TTS do Gemini, gerado quando o professor
 * salva a atividade — ver `atividade-gerar-audio`).
 *
 * Decisão de 26/07/2026, revertendo `speechSynthesis`: em teste real, boa
 * parte dos aparelhos não tinha voz em inglês instalada, tornando o exercício
 * impossível. Pré-gerar troca "às vezes funciona" por "sempre soa igual" — ao
 * custo de uma chamada de TTS por questão, uma vez, no momento de salvar (não
 * por aluno, não por tentativa).
 *
 * `audioUrl` nulo cobre os dois casos em que não há o que tocar — questão não
 * é `ordenar_audio`, ou a geração falhou ao salvar — e os dois caem no mesmo
 * fallback: revelar o texto em vez de tocar.
 */
export function BotaoOuvir({ frase, audioUrl }: { frase: string; audioUrl: string | null }) {
  const [tocando, setTocando] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [revelada, setRevelada] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function tocar() {
    if (!audioUrl) return
    if (!audioRef.current) audioRef.current = new Audio(audioUrl)
    const audio = audioRef.current

    audio.currentTime = 0
    setCarregando(true)
    audio.onplaying = () => {
      setCarregando(false)
      setTocando(true)
    }
    audio.onended = () => setTocando(false)
    audio.onerror = () => {
      // URL assinada expira em 1h (tarefa-obter) — se o aluno demorar mais que
      // isso para chegar nesta questão, o áudio para de carregar. Cai no
      // mesmo fallback de "geração falhou": não há diferença prática para o
      // aluno entre os dois motivos.
      setCarregando(false)
      setTocando(false)
      setFalhou(true)
    }
    audio.play().catch(() => {
      setCarregando(false)
      setFalhou(true)
    })
  }

  if (!audioUrl || falhou) {
    return (
      <div className="rounded-2xl bg-amber-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Não consegui carregar o áudio desta questão.
        </p>
        {/* Sem áudio o exercício seria impossível. Em vez de travar o aluno,
            viramos um "ordenar palavras" com a frase à vista — ele ainda
            pratica a ordem, só perde a parte de escuta. */}
        {revelada ? (
          <p className="mt-2 text-sm font-bold text-amber-900">{frase}</p>
        ) : (
          <button
            onClick={() => setRevelada(true)}
            className="mt-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-extrabold text-white"
          >
            Ler a frase em vez de ouvir
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={tocar}
      disabled={carregando}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-100 py-4 text-sm font-extrabold text-indigo-900 transition active:scale-[0.99] disabled:opacity-70"
    >
      {carregando ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Volume2 className={`h-5 w-5 ${tocando ? 'animate-pulse' : ''}`} />
      )}
      {carregando ? 'Carregando...' : tocando ? 'Tocando...' : 'Ouvir a frase'}
    </button>
  )
}

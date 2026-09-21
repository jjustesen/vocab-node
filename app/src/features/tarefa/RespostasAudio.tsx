import { useRef, useState } from 'react'
import { AlertTriangle, Loader2, Turtle, Volume2 } from 'lucide-react'
import { BOTAO_CHUNKY } from './estilo'

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
  /** Qual dos dois botões está tocando — cada um pulsa só quando é o seu. */
  const [tocando, setTocando] = useState<'normal' | 'lento' | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [revelada, setRevelada] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /**
   * `velocidade` é o "modo tartaruga": o mesmo áudio a 0.7x, sem regerar
   * nada no servidor. `preservesPitch` (padrão true nos navegadores atuais)
   * mantém o tom da voz — sem ele, a fala lenta soaria grave, como fita
   * esticada, e o aluno estaria treinando o ouvido num som que não existe.
   */
  function tocar(velocidade: 'normal' | 'lento') {
    if (!audioUrl) return
    if (!audioRef.current) audioRef.current = new Audio(audioUrl)
    const audio = audioRef.current

    audio.currentTime = 0
    audio.playbackRate = velocidade === 'lento' ? 0.7 : 1
    audio.preservesPitch = true
    setCarregando(true)
    audio.onplaying = () => {
      setCarregando(false)
      setTocando(velocidade)
    }
    audio.onended = () => setTocando(null)
    audio.onerror = () => {
      // URL assinada expira em 1h (tarefa-obter) — se o aluno demorar mais que
      // isso para chegar nesta questão, o áudio para de carregar. Cai no
      // mesmo fallback de "geração falhou": não há diferença prática para o
      // aluno entre os dois motivos.
      setCarregando(false)
      setTocando(null)
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
    <div className="flex gap-3">
      <button
        onClick={() => tocar('normal')}
        disabled={carregando}
        className={`${BOTAO_CHUNKY} min-w-0 flex-1 border-violet-700 bg-violet-500 py-4 text-base text-white`}
      >
        {carregando ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Volume2 className={`h-6 w-6 ${tocando === 'normal' ? 'animate-pulse' : ''}`} strokeWidth={2.5} />
        )}
        {carregando ? 'Carregando...' : tocando === 'normal' ? 'Tocando...' : 'Ouvir a frase'}
      </button>
      {/* A tartaruga do Duolingo: mesma frase, mais devagar. Quadrado e
          menor de propósito — é apoio, não a ação principal. */}
      <button
        onClick={() => tocar('lento')}
        disabled={carregando}
        title="Ouvir mais devagar"
        aria-label="Ouvir mais devagar"
        className={`${BOTAO_CHUNKY} w-16 shrink-0 border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200`}
      >
        <Turtle className={`h-7 w-7 ${tocando === 'lento' ? 'animate-pulse' : ''}`} strokeWidth={2.25} />
      </button>
    </div>
  )
}

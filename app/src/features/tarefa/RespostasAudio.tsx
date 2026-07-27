import { useEffect, useState } from 'react'
import { AlertTriangle, Volume2 } from 'lucide-react'

/**
 * Fala a frase com o sintetizador do próprio navegador.
 *
 * Decisão de 26/07/2026: não geramos nem guardamos áudio. A frase já viaja
 * para o cliente em `resposta_correta` (CONTRATO-QUESTOES.md §7), então o
 * `speechSynthesis` resolve sem bucket, sem TTS pago e sem URL assinada. O
 * preço é a voz variar por aparelho — e, em aparelho sem voz em inglês, não
 * haver voz nenhuma. Daí o caminho de degradação logo abaixo.
 */
function vozEmIngles(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices()
  return vozes.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? null
}

export function BotaoOuvir({ frase }: { frase: string }) {
  const [falando, setFalando] = useState(false)
  const [semVoz, setSemVoz] = useState(false)
  const [revelada, setRevelada] = useState(false)

  // A lista de vozes chega assíncrona no Chrome: na primeira renderização ela
  // costuma vir vazia, e só depois de `voiceschanged` é que dá para saber se
  // existe voz em inglês. Sem esperar por isso, todo aparelho parece "sem voz".
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSemVoz(true)
      return
    }
    const conferir = () => setSemVoz(window.speechSynthesis.getVoices().length > 0 && !vozEmIngles())
    conferir()
    window.speechSynthesis.addEventListener('voiceschanged', conferir)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', conferir)
      window.speechSynthesis.cancel()
    }
  }, [])

  function falar() {
    if (!('speechSynthesis' in window)) return setSemVoz(true)
    window.speechSynthesis.cancel()

    const fala = new SpeechSynthesisUtterance(frase)
    fala.lang = 'en-US'
    // Um pouco mais devagar que o padrão: é material de estudo, e o aluno
    // precisa distinguir palavra por palavra para conseguir ordenar.
    fala.rate = 0.85
    const voz = vozEmIngles()
    if (voz) fala.voice = voz
    fala.onstart = () => setFalando(true)
    fala.onend = () => setFalando(false)
    fala.onerror = () => {
      setFalando(false)
      setSemVoz(true)
    }
    window.speechSynthesis.speak(fala)
  }

  if (semVoz) {
    return (
      <div className="rounded-2xl bg-amber-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Este aparelho não tem voz em inglês instalada.
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
      onClick={falar}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-100 py-4 text-sm font-extrabold text-indigo-900 transition active:scale-[0.99]"
    >
      <Volume2 className={`h-5 w-5 ${falando ? 'animate-pulse' : ''}`} />
      {falando ? 'Falando...' : 'Ouvir a frase'}
    </button>
  )
}


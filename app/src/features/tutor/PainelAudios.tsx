import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Pause, Play, Wand2 } from 'lucide-react'
import { textoDaFala, type Fala } from '../../../../poc-tutor/src/falas.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'
import { chavesTutor, gravarFalas, URL_DAS_FALAS } from './api'

/** Por chamada a tutor-gravar-falas: o TTS leva 2–4 s por fala, e a função tem tempo contado. */
const LEVA = 4
/** Depois de um "limite do TTS", quanto esperar antes de mandar a mesma leva de novo. */
const ESPERA_DO_LIMITE_MS = 30_000

type FalaFixa = { chave: string; fala: Fala }

/**
 * As falas que o tutor sempre diz nesta lição ("Diga em inglês: …", "Quase!
 * Como se diz…"), cada uma gravada ou não. Gravada, toca na hora para o aluno,
 * sem esperar nem pagar o TTS; o play aqui é para o professor conferir a voz.
 *
 * As falas vêm do roteiro SALVO: o áudio é das frases que o aluno vai ouvir.
 */
export function PainelAudios({
  licaoId,
  roteiroSalvo,
  gravadas,
  podeGravar,
  temMudancas,
}: {
  licaoId: string
  roteiroSalvo: Roteiro
  gravadas: string[]
  podeGravar: boolean
  temMudancas: boolean
}) {
  const qc = useQueryClient()
  const [falas, setFalas] = useState<FalaFixa[] | null>(null)
  const [progresso, setProgresso] = useState<{ feitas: number; total: number; aviso?: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tocando, setTocando] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  // Calcula num worker: numa lição grande são segundos de controlador.
  useEffect(() => {
    setFalas(null)
    const worker = new Worker(new URL('./falasFixas.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<FalaFixa[]>) => setFalas(e.data)
    worker.postMessage(roteiroSalvo)
    return () => worker.terminate()
  }, [roteiroSalvo])

  useEffect(() => () => audio.current?.pause(), [])

  const jaGravadas = new Set(gravadas)
  const faltam = (falas ?? []).filter((f) => !jaGravadas.has(f.chave))

  async function gerar() {
    setErro(null)
    const fila = [...faltam]
    setProgresso({ feitas: 0, total: fila.length })
    let feitas = 0
    try {
      for (let i = 0; i < fila.length; i += LEVA) {
        const leva = fila.slice(i, i + LEVA)
        for (let tentativa = 1; ; tentativa++) {
          const r = await gravarFalas(
            licaoId,
            leva.map((f) => f.fala),
          )
          feitas += r.gravadas.length + r.jaExistiam.length
          setProgresso({ feitas, total: fila.length })
          if (!r.limiteDoTts || tentativa >= 5) {
            if (r.falharam.length) {
              setErro(`${r.falharam.length} falas não gravaram (${r.falharam[0].erro}). Tente de novo daqui a pouco.`)
            }
            break
          }
          // O TTS tem cota por minuto: espera e manda só o que faltou desta leva.
          setProgresso({ feitas, total: fila.length, aviso: 'Limite de voz por minuto — esperando para continuar…' })
          await new Promise((ok) => setTimeout(ok, ESPERA_DO_LIMITE_MS))
          const falhou = new Set(r.falharam.map((f) => f.chave))
          leva.splice(0, leva.length, ...leva.filter((f) => falhou.has(f.chave)))
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gravar os áudios.')
    } finally {
      setProgresso(null)
      qc.invalidateQueries({ queryKey: chavesTutor.licao(licaoId) })
      qc.invalidateQueries({ queryKey: chavesTutor.todasAsLicoes })
    }
  }

  function tocar(chave: string) {
    audio.current?.pause()
    if (tocando === chave) return setTocando(null)
    const el = new Audio(`${URL_DAS_FALAS}${chave}.mp3`)
    el.onended = () => setTocando(null)
    el.onerror = () => setTocando(null)
    audio.current = el
    setTocando(chave)
    void el.play().catch(() => setTocando(null))
  }

  if (!falas) {
    return (
      <p className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Listando as falas da lição…
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        <strong>{falas.length - faltam.length}</strong> de {falas.length} falas gravadas.{' '}
        {faltam.length > 0 && 'As que faltam o aluno ouve na hora, pela voz em stream — funciona, mas demora um pouco mais.'}
      </p>
      {temMudancas && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900">
          Há mudanças não salvas. Salve a lição antes de gerar: os áudios são das frases salvas.
        </p>
      )}

      {podeGravar && faltam.length > 0 && (
        <button
          type="button"
          onClick={() => void gerar()}
          disabled={Boolean(progresso) || temMudancas}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {progresso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {progresso ? `Gravando ${progresso.feitas} de ${progresso.total}…` : `Gerar os ${faltam.length} que faltam`}
        </button>
      )}
      {progresso?.aviso && <p className="text-xs text-neutral-500">{progresso.aviso}</p>}
      {erro && <p className="rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">{erro}</p>}

      <ul className="max-h-[28rem] divide-y divide-neutral-100 overflow-y-auto rounded-2xl border border-neutral-200">
        {falas.map(({ chave, fala }) => {
          const gravada = jaGravadas.has(chave)
          return (
            <li key={chave} className="flex items-center gap-2 px-3 py-2 text-sm">
              {gravada ? (
                <button
                  type="button"
                  onClick={() => tocar(chave)}
                  aria-label={tocando === chave ? 'Parar' : 'Ouvir'}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700"
                >
                  {tocando === chave ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="grid h-7 w-7 shrink-0 place-items-center text-[10px] font-bold text-neutral-300">—</span>
              )}
              <span className="min-w-0 flex-1">{textoDaFala(fala)}</span>
              {gravada && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="gravada" />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

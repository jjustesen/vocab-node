import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Pause, Play, Wand2 } from 'lucide-react'
import { textoDaFala } from '../../../../poc-tutor/src/falas.ts'
import { chavesTutor, emReais, gravarFalas } from './api'
import type { FalaFixa, Tocador } from './audiosDaLicao'

/** Por chamada a tutor-gravar-falas: o TTS leva 2–4 s por fala, e a função tem tempo contado. */
const LEVA = 4
/** Depois de um "limite do TTS", quanto esperar antes de mandar a mesma leva de novo. */
const ESPERA_DO_LIMITE_MS = 30_000
/**
 * US$ por caractere da voz do tutor (Grok TTS, US$ 15 por 1 milhão).
 * ESPELHO de 'xai-tts' em supabase/functions/_shared/tutor/precos.ts.
 */
const USD_POR_CARACTERE = 15 / 1_000_000

const custoDe = (falas: FalaFixa[]) => falas.reduce((s, f) => s + textoDaFala(f.fala).length, 0) * USD_POR_CARACTERE

/**
 * Todas as falas que o tutor sempre diz nesta lição ("Diga em inglês: …",
 * "Quase! Como se diz…", "Muito bem."), cada uma gravada ou não. Gravada, toca
 * na hora para o aluno, sem esperar nem pagar o TTS; o play aqui é para o
 * professor conferir a voz. Dentro de cada exercício aparecem as dele.
 *
 * As falas vêm do roteiro SALVO: o áudio é das frases que o aluno vai ouvir.
 */
export function PainelAudios({
  licaoId,
  falas,
  gravadas,
  gasto,
  tocador,
  podeGravar,
  temMudancas,
}: {
  licaoId: string
  falas: FalaFixa[] | null
  gravadas: Set<string>
  /** US$ já gastos gravando esta lição (tutor_licoes.custo_audios_usd). */
  gasto: number
  tocador: Tocador
  podeGravar: boolean
  temMudancas: boolean
}) {
  const qc = useQueryClient()
  const [progresso, setProgresso] = useState<{ feitas: number; total: number; aviso?: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /** Falas sendo geradas uma a uma, pelo botão da linha. */
  const [gerandoUma, setGerandoUma] = useState<Set<string>>(new Set())

  const faltam = (falas ?? []).filter((f) => !gravadas.has(f.chave))
  // Gravadas antes de o custo ser registrado (21/10/2026): só dá para estimar.
  const gastoEstimado = gasto === 0 && gravadas.size > 0
  const jaGasto = gastoEstimado ? custoDe((falas ?? []).filter((f) => gravadas.has(f.chave))) : gasto

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

  async function gerarUma(f: FalaFixa) {
    setErro(null)
    setGerandoUma((s) => new Set(s).add(f.chave))
    try {
      const r = await gravarFalas(licaoId, [f.fala])
      if (r.falharam.length) setErro(r.limiteDoTts ? 'Limite de voz por minuto. Tente de novo daqui a pouco.' : `Não gravou: ${r.falharam[0].erro}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gravar o áudio.')
    } finally {
      await qc.invalidateQueries({ queryKey: chavesTutor.licao(licaoId) })
      qc.invalidateQueries({ queryKey: chavesTutor.todasAsLicoes })
      setGerandoUma((s) => {
        const novo = new Set(s)
        novo.delete(f.chave)
        return novo
      })
    }
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
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-2xl bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-500">Já gasto</dt>
          <dd className="font-extrabold">
            {gastoEstimado && '~'}
            {emReais(jaGasto)}
          </dd>
        </div>
        <div className="rounded-2xl bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-500">Para gerar as que faltam</dt>
          <dd className="font-extrabold">~{emReais(custoDe(faltam))}</dd>
        </div>
        <div className="rounded-2xl bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-500">A lição inteira</dt>
          <dd className="font-extrabold">~{emReais(custoDe(falas))}</dd>
        </div>
      </dl>
      <p className="text-xs text-neutral-500">
        Paga uma vez só: depois de gravada, a fala toca para todos os alunos sem custo.
        {gastoEstimado && ' O "já gasto" é estimado: estas falas foram gravadas antes de o custo ser registrado.'}
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
        {falas.map((f) => {
          const { chave, fala } = f
          const gravada = gravadas.has(chave)
          const tocando = tocador.tocando === chave
          return (
            <li key={chave} className="flex items-center gap-2 px-3 py-2 text-sm">
              {gravada ? (
                <button
                  type="button"
                  onClick={() => tocador.tocar(chave)}
                  aria-label={tocando ? 'Parar' : 'Ouvir'}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700"
                >
                  {tocando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              ) : podeGravar ? (
                <button
                  type="button"
                  onClick={() => void gerarUma(f)}
                  disabled={gerandoUma.has(chave) || Boolean(progresso) || temMudancas}
                  aria-label="Gerar o áudio desta fala"
                  title={`Gerar este áudio (${emReais(custoDe([f]))})`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-violet-100 hover:text-violet-700 disabled:opacity-40"
                >
                  {gerandoUma.has(chave) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
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

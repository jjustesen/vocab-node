import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Fala } from '../../../../poc-tutor/src/falas.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'
import { chavesTutor, gravarFalas, URL_DAS_FALAS } from './api'

/** Uma fala fixa da lição e os itens em que o tutor a diz (ver falasFixasComItens). */
export type FalaFixa = { chave: string; fala: Fala; itens: string[] }

/**
 * As falas fixas do roteiro SALVO, calculadas num worker: numa lição grande
 * são segundos de controlador, e o editor continua respondendo enquanto isso.
 */
export function useFalasDaLicao(roteiro: Roteiro | null): FalaFixa[] | null {
  const [falas, setFalas] = useState<FalaFixa[] | null>(null)
  useEffect(() => {
    setFalas(null)
    if (!roteiro) return
    const worker = new Worker(new URL('./falasFixas.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<FalaFixa[]>) => setFalas(e.data)
    worker.postMessage(roteiro)
    return () => worker.terminate()
  }, [roteiro])
  return falas
}

/** Gerar o áudio de UMA fala (o botão da linha, no exercício ou no painel Áudios). */
export type GeradorDeFala = {
  gerando: Set<string>
  erro: string | null
  gerar: (f: FalaFixa) => Promise<void>
}

export function useGeradorDeFala(licaoId: string | undefined): GeradorDeFala {
  const qc = useQueryClient()
  const [gerando, setGerando] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const gerar = useCallback(
    async (f: FalaFixa) => {
      if (!licaoId) return
      setErro(null)
      setGerando((s) => new Set(s).add(f.chave))
      try {
        const r = await gravarFalas(licaoId, [f.fala])
        if (r.falharam.length) setErro(r.limiteDoTts ? 'Limite de voz por minuto. Tente de novo daqui a pouco.' : `Não gravou: ${r.falharam[0].erro}`)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não consegui gravar o áudio.')
      } finally {
        await qc.invalidateQueries({ queryKey: chavesTutor.licao(licaoId) })
        qc.invalidateQueries({ queryKey: chavesTutor.todasAsLicoes })
        setGerando((s) => {
          const novo = new Set(s)
          novo.delete(f.chave)
          return novo
        })
      }
    },
    [licaoId, qc],
  )
  return { gerando, erro, gerar }
}

export type Tocador = { tocando: string | null; tocar: (chave: string) => void }

/** Um áudio por vez na página inteira: tocar outro para o anterior; tocar o mesmo para. */
export function useTocador(): Tocador {
  const [tocando, setTocando] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const atual = useRef<string | null>(null)

  useEffect(() => () => audio.current?.pause(), [])

  const tocar = useCallback((chave: string) => {
    audio.current?.pause()
    if (atual.current === chave) {
      atual.current = null
      return setTocando(null)
    }
    const el = new Audio(`${URL_DAS_FALAS}${chave}.mp3`)
    const fim = () => {
      if (atual.current === chave) {
        atual.current = null
        setTocando(null)
      }
    }
    el.onended = fim
    el.onerror = fim
    audio.current = el
    atual.current = chave
    setTocando(chave)
    void el.play().catch(fim)
  }, [])

  return { tocando, tocar }
}

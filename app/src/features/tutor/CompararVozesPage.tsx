import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Play, Square, Volume2, Wand2 } from 'lucide-react'
import { Interruptor } from '@/components/Interruptor'
import { emReais, useAcessoTutor } from './api'
import { falarNoProvedor, type ProvedorDeVoz, useProvedoresDeVoz } from './apiVozes'

/**
 * /tutor/vozes — o mesmo grupo de falas em cada serviço de voz, lado a lado.
 *
 * Serve para escolher o TTS do tutor pelo ouvido, com dois números que ajudam
 * a ver a "inconsistência" que se ouve: quanto o volume e o ritmo variam de
 * uma fala para outra dentro da mesma voz. "Igualar volume" toca tudo no mesmo
 * nível, para separar o que é volume do que é tom.
 */

const FALAS_PADRAO = [
  'Muito bem!',
  'Vamos começar. Diga em inglês: eu estava em casa ontem.',
  'I was at home yesterday.',
  "Quase! Lembre que com 'they' o verbo muda. Tente de novo.",
  'They were at home.',
  'Agora passe para a negativa: She works on Saturdays.',
  "She doesn't work on Saturdays.",
  'Perfeito. Próxima frase.',
  'Did you go to the party last night?',
  "Não exatamente. Qual é o passado de 'go'?",
  'Exactly! You went to the party.',
  'Ótimo trabalho hoje. Até a próxima!',
]

/** Nível de referência ao igualar o volume (RMS das partes com som). */
const ALVO_DB = -20

type Escolha = { modelo: string; voz: string }

type Resultado =
  | { estado: 'gerando' }
  | { estado: 'erro'; erro: string }
  | { estado: 'pronto'; buffer: AudioBuffer; ms: number; custoUsd: number; db: number; caracteresPorSegundo: number }

const chave = (provedor: string, e: Escolha, texto: string) => `${provedor}|${e.modelo}|${e.voz}|${texto}`

export function CompararVozesPage() {
  const { data: acesso, isLoading: carregandoAcesso } = useAcessoTutor()
  const { data: provedores, isLoading, error } = useProvedoresDeVoz(Boolean(acesso))
  const [textoFalas, setTextoFalas] = useState(FALAS_PADRAO.join('\n'))
  const falas = useMemo(
    () => textoFalas.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20),
    [textoFalas],
  )
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({})
  const [resultados, setResultados] = useState<Record<string, Resultado>>({})
  const [igualar, setIgualar] = useState(true)
  const [tocando, setTocando] = useState<string | null>(null)
  const tocador = useTocadorDeBuffers()

  // A primeira voz e o primeiro modelo de cada serviço, assim que a lista chega.
  useEffect(() => {
    if (!provedores) return
    setEscolhas((atual) => {
      const novo = { ...atual }
      for (const p of provedores) novo[p.id] ??= { modelo: p.modelos[0]?.id ?? '', voz: p.vozes[0]?.id ?? '' }
      return novo
    })
  }, [provedores])

  if (carregandoAcesso || isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  if (!acesso) return <p className="mx-auto max-w-3xl text-sm text-neutral-500">O tutor não está liberado para a sua conta.</p>

  async function gerar(p: ProvedorDeVoz) {
    const e = escolhas[p.id]
    if (!e) return
    const pendentes = falas.filter((t) => resultados[chave(p.id, e, t)]?.estado !== 'pronto')
    setResultados((r) => ({ ...r, ...Object.fromEntries(pendentes.map((t) => [chave(p.id, e, t), { estado: 'gerando' as const }])) }))
    // Duas de cada vez por serviço: rápido o bastante sem bater no limite por minuto.
    const fila = [...pendentes]
    const trabalhar = async () => {
      for (let t = fila.shift(); t !== undefined; t = fila.shift()) {
        const k = chave(p.id, e, t)
        try {
          const r = await falarNoProvedor({ provedor: p.id, modelo: e.modelo, voz: e.voz, texto: t })
          const buffer = await tocador.decodificar(r.base64)
          const { db, segundosComSom } = medir(buffer)
          setResultados((atual) => ({
            ...atual,
            [k]: {
              estado: 'pronto',
              buffer,
              ms: r.ms,
              custoUsd: r.custoUsd,
              db,
              caracteresPorSegundo: t.length / Math.max(0.2, segundosComSom),
            },
          }))
        } catch (erro) {
          setResultados((atual) => ({ ...atual, [k]: { estado: 'erro', erro: erro instanceof Error ? erro.message : 'Falhou.' } }))
        }
      }
    }
    await Promise.all([trabalhar(), trabalhar()])
  }

  function tocar(k: string) {
    const r = resultados[k]
    if (r?.estado !== 'pronto') return
    setTocando(k)
    void tocador.tocar(r.buffer, igualar ? ALVO_DB - r.db : 0).finally(() => setTocando((t) => (t === k ? null : t)))
  }

  async function tocarColuna(p: ProvedorDeVoz) {
    const e = escolhas[p.id]
    const id = `coluna|${p.id}`
    setTocando(id)
    for (const t of falas) {
      const r = resultados[chave(p.id, e, t)]
      if (r?.estado !== 'pronto') continue
      const terminou = await tocador.tocar(r.buffer, igualar ? ALVO_DB - r.db : 0)
      if (!terminou) return
      await new Promise((ok) => setTimeout(ok, 350))
    }
    setTocando((t) => (t === id ? null : t))
  }

  function parar() {
    tocador.parar()
    setTocando(null)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/tutor?aba=preferencias" className="inline-flex items-center gap-1 text-sm font-bold text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> Tutor
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold">Comparar vozes</h1>
      <p className="mt-0.5 max-w-3xl text-sm text-neutral-500">
        As mesmas falas do tutor em cada serviço de voz. Ouça a coluna inteira em sequência: o que importa é a voz soar
        igual de uma fala para outra, em português e em inglês. Embaixo de cada coluna, quanto o volume e o ritmo variam —
        quanto menor, mais estável.
      </p>

      {error && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{(error as Error).message}</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <label className="block rounded-3xl bg-white p-5">
          <span className="font-extrabold">Falas</span>
          <span className="mt-1 block text-sm text-neutral-500">Uma por linha, até 20. Misture português e inglês como o tutor faz.</span>
          <textarea
            value={textoFalas}
            onChange={(e) => setTextoFalas(e.target.value)}
            rows={8}
            className="mt-3 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <Interruptor
          Icone={Volume2}
          titulo="Igualar volume"
          descricao="Toca todas as falas no mesmo nível. Ligado, sobra só a diferença de tom e de ritmo; desligado, você ouve o volume como o serviço entrega."
          ligado={igualar}
          aoMudar={setIgualar}
        />
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        <table className="w-full min-w-[56rem] border-separate border-spacing-x-2 border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="align-top">
              <th className="w-56 text-left" />
              {provedores?.map((p) => (
                <th key={p.id} className="rounded-3xl bg-white p-4 text-left font-normal">
                  <CabecalhoDoProvedor
                    provedor={p}
                    escolha={escolhas[p.id]}
                    aoEscolher={(e) => setEscolhas((a) => ({ ...a, [p.id]: e }))}
                    aoGerar={() => void gerar(p)}
                    gerando={falas.some((t) => escolhas[p.id] && resultados[chave(p.id, escolhas[p.id], t)]?.estado === 'gerando')}
                    tocandoColuna={tocando === `coluna|${p.id}`}
                    aoTocarColuna={() => (tocando === `coluna|${p.id}` ? parar() : void tocarColuna(p))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {falas.map((t) => (
              <tr key={t}>
                <td className="py-1 pr-2 align-middle text-neutral-700">{t}</td>
                {provedores?.map((p) => {
                  const e = escolhas[p.id]
                  const k = e ? chave(p.id, e, t) : ''
                  return (
                    <td key={p.id} className="rounded-2xl bg-white px-3 py-2 align-middle">
                      <Celula resultado={resultados[k]} tocando={tocando === k} aoTocar={() => (tocando === k ? parar() : tocar(k))} />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-2 align-top text-xs font-bold uppercase tracking-wide text-neutral-400">Estabilidade</td>
              {provedores?.map((p) => (
                <td key={p.id} className="rounded-2xl bg-neutral-900 px-3 py-3 align-top text-white">
                  <Resumo itens={falas.map((t) => (escolhas[p.id] ? resultados[chave(p.id, escolhas[p.id], t)] : undefined))} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CabecalhoDoProvedor({
  provedor,
  escolha,
  aoEscolher,
  aoGerar,
  gerando,
  tocandoColuna,
  aoTocarColuna,
}: {
  provedor: ProvedorDeVoz
  escolha: Escolha | undefined
  aoEscolher: (e: Escolha) => void
  aoGerar: () => void
  gerando: boolean
  tocandoColuna: boolean
  aoTocarColuna: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="font-extrabold">{provedor.nome}</p>
      {provedor.erro ? (
        <p className="text-xs text-rose-600">{provedor.erro}</p>
      ) : !provedor.configurado ? (
        <p className="text-xs text-amber-700">
          Falta a chave <code className="font-bold">{provedor.segredo}</code> nos segredos do Supabase.
        </p>
      ) : (
        <>
          {provedor.modelos.length > 1 && (
            <select
              value={escolha?.modelo}
              onChange={(e) => escolha && aoEscolher({ ...escolha, modelo: e.target.value })}
              className="w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-xs"
            >
              {provedor.modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          )}
          <select
            value={escolha?.voz}
            onChange={(e) => escolha && aoEscolher({ ...escolha, voz: e.target.value })}
            className="w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-xs"
          >
            {provedor.vozes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-400">{provedor.preco}</p>
          <div className="flex gap-1.5">
            <button
              onClick={aoGerar}
              disabled={gerando}
              className="flex flex-1 items-center justify-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Gerar
            </button>
            <button
              onClick={aoTocarColuna}
              className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700"
              aria-label={tocandoColuna ? 'Parar' : 'Ouvir a coluna em sequência'}
            >
              {tocandoColuna ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              Todas
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Celula({ resultado, tocando, aoTocar }: { resultado: Resultado | undefined; tocando: boolean; aoTocar: () => void }) {
  if (!resultado) return <span className="text-xs text-neutral-300">—</span>
  if (resultado.estado === 'gerando') return <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
  if (resultado.estado === 'erro')
    return (
      <span className="line-clamp-2 text-xs text-rose-600" title={resultado.erro}>
        {resultado.erro}
      </span>
    )
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={aoTocar}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tocando ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700'}`}
        aria-label={tocando ? 'Parar' : 'Ouvir'}
      >
        {tocando ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <span className="text-xs leading-tight text-neutral-500">
        {resultado.buffer.duration.toFixed(1)} s · {resultado.db.toFixed(0)} dB
        <br />
        gerou em {(resultado.ms / 1000).toFixed(1)} s
      </span>
    </div>
  )
}

/** Desvio padrão do volume (dB) e do ritmo (% de variação), mais o tempo e o custo. */
function Resumo({ itens }: { itens: (Resultado | undefined)[] }) {
  const prontos = itens.filter((r): r is Extract<Resultado, { estado: 'pronto' }> => r?.estado === 'pronto')
  if (prontos.length < 2) return <span className="text-xs text-neutral-400">Gere pelo menos 2 falas.</span>
  const volume = desvio(prontos.map((r) => r.db))
  const ritmos = prontos.map((r) => r.caracteresPorSegundo)
  const ritmo = (desvio(ritmos) / media(ritmos)) * 100
  const ms = media(prontos.map((r) => r.ms))
  const custo = prontos.reduce((s, r) => s + r.custoUsd, 0)
  return (
    <dl className="space-y-1 text-xs">
      <Linha rotulo="Volume varia" valor={`± ${volume.toFixed(1)} dB`} />
      <Linha rotulo="Ritmo varia" valor={`± ${ritmo.toFixed(0)}%`} />
      <Linha rotulo="Gera em" valor={`${(ms / 1000).toFixed(1)} s`} />
      <Linha rotulo={`${prontos.length} falas`} valor={custo > 0 ? emReais(custo) : '—'} />
    </dl>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-neutral-400">{rotulo}</dt>
      <dd className="font-bold">{valor}</dd>
    </div>
  )
}

const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
const desvio = (v: number[]) => {
  const m = media(v)
  return Math.sqrt(media(v.map((x) => (x - m) ** 2)))
}

/** Volume (RMS em dB) e duração só das janelas de 50 ms com som — o silêncio do começo e do fim não conta. */
function medir(buffer: AudioBuffer): { db: number; segundosComSom: number } {
  const dados = buffer.getChannelData(0)
  const janela = Math.round(buffer.sampleRate / 20)
  let soma = 0
  let amostras = 0
  let janelasComSom = 0
  for (let i = 0; i + janela <= dados.length; i += janela) {
    let s = 0
    for (let k = i; k < i + janela; k++) s += dados[k] * dados[k]
    const rms = Math.sqrt(s / janela)
    if (rms > 0.01) {
      soma += s
      amostras += janela
      janelasComSom++
    }
  }
  const rms = amostras ? Math.sqrt(soma / amostras) : 1e-5
  return { db: 20 * Math.log10(rms), segundosComSom: janelasComSom * 0.05 }
}

/** Um AudioContext só para a página: decodifica MP3/WAV e toca com ganho, um áudio por vez. */
function useTocadorDeBuffers() {
  const contexto = useRef<AudioContext | null>(null)
  const atual = useRef<{ fonte: AudioBufferSourceNode; fim: (terminou: boolean) => void } | null>(null)
  const ctx = () => (contexto.current ??= new AudioContext())

  useEffect(() => () => void contexto.current?.close(), [])

  return useMemo(
    () => ({
      async decodificar(base64: string): Promise<AudioBuffer> {
        const bin = atob(base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return ctx().decodeAudioData(bytes.buffer)
      },
      parar() {
        const a = atual.current
        atual.current = null
        if (!a) return
        a.fonte.onended = null
        a.fonte.stop()
        a.fim(false)
      },
      /** Resolve `true` quando tocou até o fim, `false` se foi parado. */
      tocar(buffer: AudioBuffer, ganhoDb: number): Promise<boolean> {
        this.parar()
        const c = ctx()
        void c.resume()
        const fonte = c.createBufferSource()
        fonte.buffer = buffer
        const ganho = c.createGain()
        ganho.gain.value = Math.min(8, 10 ** (ganhoDb / 20))
        fonte.connect(ganho).connect(c.destination)
        return new Promise((fim) => {
          atual.current = { fonte, fim }
          fonte.onended = () => {
            atual.current = null
            fim(true)
          }
          fonte.start()
        })
      },
    }),
    [],
  )
}

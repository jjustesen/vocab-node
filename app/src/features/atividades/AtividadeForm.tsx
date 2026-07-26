import { useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { Chip } from '@/components/Chip'
import { QuestaoEditor } from './QuestaoEditor'
import { questaoVazia, paraQuestaoContrato, type QuestaoRascunho } from './questaoRascunho'
import { questaoSchema, NIVEIS, HABILIDADES, ROTULO_HABILIDADE } from '@/types/questao'
import type { Questao } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

export type AtividadeFormValores = {
  titulo: string
  nivel: NivelCefr
  habilidades: string[]
  questoes: QuestaoRascunho[]
}

export type AtividadeFormSaida = {
  titulo: string
  nivel: NivelCefr
  habilidades: string[]
  questoes: Questao[]
}

/**
 * Formulário completo de atividade — título, nível, habilidades e o
 * construtor de questões. Usado tanto para criar (NovaAtividadePage) quanto
 * para editar (EditarAtividadePage), parametrizado por `valoresIniciais` e
 * `aoSalvar`. A página que usa isto decide se cria ou atualiza.
 */
export function AtividadeForm({
  tituloPagina,
  rotuloBotao,
  valoresIniciais,
  aoSalvar,
}: {
  tituloPagina: string
  rotuloBotao: string
  valoresIniciais?: AtividadeFormValores
  aoSalvar: (dados: AtividadeFormSaida) => Promise<void>
}) {
  const [titulo, setTitulo] = useState(valoresIniciais?.titulo ?? '')
  const [nivel, setNivel] = useState<NivelCefr>(valoresIniciais?.nivel ?? 'B1')
  const [habilidades, setHabilidades] = useState<string[]>(valoresIniciais?.habilidades ?? [])
  const [questoes, setQuestoes] = useState<QuestaoRascunho[]>(
    valoresIniciais?.questoes ?? [questaoVazia('multipla_escolha')],
  )
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function alternarHabilidade(h: string) {
    setHabilidades((atual) => (atual.includes(h) ? atual.filter((x) => x !== h) : [...atual, h]))
  }

  function mudarQuestao(i: number, v: QuestaoRascunho) {
    setQuestoes((atual) => atual.map((q, j) => (j === i ? v : q)))
  }

  function removerQuestao(i: number) {
    setQuestoes((atual) => atual.filter((_, j) => j !== i))
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (!titulo.trim()) return setErro('Dê um título para a atividade.')
    if (questoes.length === 0) return setErro('Adicione ao menos uma questão.')

    const convertidas = questoes.map(paraQuestaoContrato)
    for (let i = 0; i < convertidas.length; i++) {
      const resultado = questaoSchema.safeParse(convertidas[i])
      if (!resultado.success) {
        return setErro(`Questão ${i + 1}: ${resultado.error.issues[0]?.message ?? 'dados incompletos'}.`)
      }
    }

    setSalvando(true)
    try {
      await aoSalvar({
        titulo: titulo.trim(),
        nivel,
        habilidades,
        questoes: convertidas.map((c) => questaoSchema.parse(c)),
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* w-full no celular: com o botão na mesma linha, sobra pouco espaço e
            o título fica ilegível — melhor o botão descer para a linha de baixo. */}
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="text-xs font-bold text-neutral-400">{tituloPagina}</p>
          {/* O título é o cabeçalho da tela e o campo ao mesmo tempo, como no
              mockup — sem uma caixa de formulário separada só para ele. */}
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Travel vocabulary — Unit 7"
            className="-ml-1 w-full rounded-lg bg-transparent px-1 text-2xl font-extrabold outline-none placeholder:text-neutral-300 focus:bg-white"
          />
          <p className="mt-0.5 text-sm text-neutral-500">
            {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'} · {nivel}
          </p>
        </div>
        <button
          type="submit"
          disabled={salvando}
          className="flex shrink-0 items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {rotuloBotao}
        </button>
      </div>

      {erro && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</p>
      )}

      <div className="mt-5 grid gap-4 rounded-3xl bg-white p-5 sm:grid-cols-2">
        <div>
          <span className="text-xs font-bold text-neutral-600">Nível</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NIVEIS.map((n) => (
              <Chip key={n} ativo={nivel === n} aoClicar={() => setNivel(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs font-bold text-neutral-600">Habilidades</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {HABILIDADES.map((h) => (
              <Chip
                key={h}
                ativo={habilidades.includes(h)}
                variante="lilas"
                aoClicar={() => alternarHabilidade(h)}
              >
                {habilidades.includes(h) && <Check className="h-3 w-3" />}
                {ROTULO_HABILIDADE[h]}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {questoes.map((q, i) => (
          <QuestaoEditor
            key={i}
            numero={i + 1}
            valor={q}
            onMudar={(v) => mudarQuestao(i, v)}
            onRemover={() => removerQuestao(i)}
            // Questão em branco já abre no formulário: não há nada para ler.
            editandoInicialmente={!q.enunciado}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setQuestoes((atual) => [...atual, questaoVazia('multipla_escolha')])}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 py-3.5 text-sm font-bold text-neutral-500 transition hover:border-neutral-400"
      >
        <Plus className="h-4 w-4" /> Adicionar questão
      </button>
    </form>
  )
}

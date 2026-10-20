import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import type { ErroPrevisto, Item, TipoItem } from '../../../../poc-tutor/src/tipos.ts'
import { Area, Campo, Linhas } from './campos'
import { slug } from './slug'

const ROTULO_DO_TIPO: Record<TipoItem, string> = {
  construcao: 'Construção',
  substituicao: 'Substituição',
  transformacao: 'Transformação',
  repeticao: 'Repetição',
  conversa: 'Conversa',
}

const EXPLICACAO_DO_TIPO: Record<TipoItem, string> = {
  construcao: 'O tutor pede em português e o aluno diz em inglês.',
  substituicao: 'O tutor dá uma pista e o aluno muda a frase anterior com ela.',
  transformacao: 'O tutor diz uma frase em inglês e o aluno a transforma (negativa, pergunta, passado…).',
  repeticao: 'O tutor diz a frase e o aluno repete. Não conta como feita sozinho.',
  conversa: 'Uma pergunta sobre a vida do aluno; várias respostas valem.',
}

/** A linha fechada: o tipo, o que o tutor pede e a resposta esperada. */
function resumoDoItem(item: Item): string {
  const pedido =
    item.tipo === 'construcao'
      ? item.solicitacao
      : item.tipo === 'substituicao'
        ? item.pista
        : item.tipo === 'transformacao'
          ? `${item.instrucao ?? ''}: ${item.modelo ?? ''}`
          : item.tipo === 'repeticao'
            ? item.modelo
            : item.pergunta
  return item.tipo === 'conversa' || item.tipo === 'repeticao' ? (pedido ?? '') : `${pedido ?? ''} → ${item.alvo ?? '…'}`
}

/**
 * Um item da lição: fechado, uma linha; aberto, os campos do tipo dele, as
 * dicas e os erros comuns. Os rótulos falam a língua do professor, não a do
 * roteiro ("Resposta esperada", não "alvo").
 */
export function EditorDeItem({
  item,
  aoMudar,
  aoRemover,
  aoSubir,
  aoDescer,
  tipos,
  apoios,
  numero,
  somenteLeitura,
}: {
  item: Item
  aoMudar: (item: Item) => void
  aoRemover?: () => void
  aoSubir?: () => void
  aoDescer?: () => void
  tipos: TipoItem[]
  /** As escadas de "passo a passo" da lição, para ligar a este item. */
  apoios: { id: string; objetivo: string }[]
  numero: number
  somenteLeitura?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const mudar = (campos: Partial<Item>) => aoMudar({ ...item, ...campos })
  const ajudas = item.ajudas ?? []

  return (
    <li className="rounded-2xl border border-neutral-200">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="w-5 shrink-0 text-right text-xs font-bold text-neutral-400">{numero}</span>
          <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">
            {ROTULO_DO_TIPO[item.tipo]}
          </span>
          <span className="truncate text-sm">{resumoDoItem(item) || <em className="text-neutral-400">vazio</em>}</span>
          <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-neutral-400 transition ${aberto ? 'rotate-180' : ''}`} />
        </button>
        {!somenteLeitura && (
          <span className="flex shrink-0 gap-0.5">
            <BotaoIcone rotulo="Subir" aoClicar={aoSubir} Icone={ArrowUp} />
            <BotaoIcone rotulo="Descer" aoClicar={aoDescer} Icone={ArrowDown} />
            <BotaoIcone rotulo="Remover item" aoClicar={aoRemover} Icone={Trash2} />
          </span>
        )}
      </div>

      {aberto && (
        <div className="space-y-3 border-t border-neutral-100 px-3 py-3">
          {tipos.length > 1 && (
            <div>
              <label className="text-xs font-bold text-neutral-600">
                Tipo
                <select
                  value={item.tipo}
                  onChange={(e) => mudar({ tipo: e.target.value as TipoItem })}
                  className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal"
                >
                  {tipos.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_DO_TIPO[t]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-[11px] text-neutral-400">{EXPLICACAO_DO_TIPO[item.tipo]}</p>
            </div>
          )}

          {item.tipo === 'construcao' && (
            <Campo
              rotulo="O que o tutor pede (em português)"
              valor={item.solicitacao}
              aoMudar={(v) => mudar({ solicitacao: v })}
              placeholder="eu falo inglês"
            />
          )}
          {item.tipo === 'substituicao' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Campo rotulo="Pista" valor={item.pista} aoMudar={(v) => mudar({ pista: v })} placeholder="alemão" />
              <label className="text-xs font-bold text-neutral-600">
                A pista é dita em
                <select
                  value={item.idiomaDaPista ?? 'en'}
                  onChange={(e) => mudar({ idiomaDaPista: e.target.value === 'pt' ? 'pt' : undefined })}
                  className="mt-1 block rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal"
                >
                  <option value="pt">português</option>
                  <option value="en">inglês</option>
                </select>
              </label>
            </div>
          )}
          {(item.tipo === 'repeticao' || item.tipo === 'transformacao') && (
            <Campo
              rotulo={item.tipo === 'repeticao' ? 'Frase para repetir' : 'Frase que o tutor diz (em inglês)'}
              valor={item.modelo}
              aoMudar={(v) => mudar({ modelo: v, ...(item.tipo === 'repeticao' ? { alvo: v } : {}) })}
              ingles
              placeholder="I eat bread."
            />
          )}
          {item.tipo === 'transformacao' && (
            <Campo
              rotulo="O que o aluno faz com a frase"
              valor={item.instrucao}
              aoMudar={(v) => mudar({ instrucao: v })}
              placeholder="Passe para a negativa"
            />
          )}
          {item.tipo === 'conversa' && (
            <>
              <Campo rotulo="Pergunta (em inglês)" valor={item.pergunta} aoMudar={(v) => mudar({ pergunta: v })} ingles />
              <Area
                rotulo="O que conta como resposta"
                valor={item.criterio}
                aoMudar={(v) => mudar({ criterio: v })}
                linhas={2}
              />
              <Linhas rotulo="Exemplos de resposta" valor={item.exemplos} aoMudar={(v) => mudar({ exemplos: v })} ingles />
              <Linhas
                rotulo="Perguntas para continuar a conversa"
                valor={item.acompanhamentos}
                aoMudar={(v) => mudar({ acompanhamentos: v })}
                ingles
              />
            </>
          )}

          {item.tipo !== 'conversa' && item.tipo !== 'repeticao' && (
            <>
              <Campo rotulo="Resposta esperada" valor={item.alvo} aoMudar={(v) => mudar({ alvo: v })} ingles />
              <Linhas
                rotulo="Outras respostas aceitas"
                ajuda="Uma por linha: contração e forma cheia, outro jeito natural de dizer."
                valor={item.variantes}
                aoMudar={(v) => mudar({ variantes: v.length ? v : undefined })}
                ingles
              />
            </>
          )}

          <Campo
            rotulo="Habilidades"
            ajuda="Separadas por vírgula: o que este item treina. O tutor volta às que derem trabalho."
            valor={item.habilidades.join(', ')}
            aoMudar={(v) => mudar({ habilidades: v.split(',').map((h) => h.trim()).filter(Boolean).map(slug) })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Area
                key={i}
                rotulo={`Dica ${i + 1}${i === 0 ? ' (mais geral)' : ' (mais específica)'}`}
                ajuda="Em português, sem dizer a resposta. De preferência uma pergunta."
                valor={ajudas[i]}
                linhas={2}
                aoMudar={(v) => {
                  const novas = [ajudas[0] ?? '', ajudas[1] ?? '']
                  novas[i] = v
                  mudar({ ajudas: novas.some((a) => a.trim()) ? novas : undefined })
                }}
              />
            ))}
          </div>

          <ErrosComuns
            erros={item.errosPrevistos ?? []}
            habilidades={item.habilidades}
            somenteLeitura={somenteLeitura}
            aoMudar={(erros) => mudar({ errosPrevistos: erros.length ? erros : undefined })}
          />

          {apoios.length > 0 && item.tipo !== 'conversa' && (
            <label className="block text-xs font-bold text-neutral-600">
              Passo a passo quando faltar a base
              <select
                value={item.apoio ?? ''}
                onChange={(e) => mudar({ apoio: e.target.value || undefined })}
                className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal"
              >
                <option value="">nenhum</option>
                {apoios.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.objetivo}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </li>
  )
}

function ErrosComuns({
  erros,
  habilidades,
  aoMudar,
  somenteLeitura,
}: {
  erros: ErroPrevisto[]
  habilidades: string[]
  aoMudar: (erros: ErroPrevisto[]) => void
  somenteLeitura?: boolean
}) {
  const mudar = (i: number, campos: Partial<ErroPrevisto>) => aoMudar(erros.map((e, j) => (j === i ? { ...e, ...campos } : e)))
  return (
    <div>
      <p className="text-xs font-bold text-neutral-600">Erros comuns</p>
      <p className="text-[11px] text-neutral-400">O erro que o aluno costuma cometer e a dica para ele se corrigir sozinho.</p>
      <ul className="mt-2 space-y-2">
        {erros.map((e, i) => (
          <li key={i} className="grid gap-2 rounded-xl bg-neutral-50 p-2 sm:grid-cols-[1fr_1fr_auto]">
            <Campo rotulo="O aluno diz" valor={e.exemplo} aoMudar={(v) => mudar(i, { exemplo: v })} ingles />
            <Campo rotulo="Dica" valor={e.pista} aoMudar={(v) => mudar(i, { pista: v })} />
            <div className="flex items-end gap-1">
              <label className="text-xs font-bold text-neutral-600">
                Habilidade
                <select
                  value={e.habilidade}
                  onChange={(ev) => mudar(i, { habilidade: ev.target.value })}
                  className="mt-1 block rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm font-normal"
                >
                  {[...new Set([...habilidades, e.habilidade])].filter(Boolean).map((h) => (
                    <option key={h} value={h}>
                      {h.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {!somenteLeitura && (
                <BotaoIcone rotulo="Remover erro" Icone={X} aoClicar={() => aoMudar(erros.filter((_, j) => j !== i))} />
              )}
            </div>
          </li>
        ))}
      </ul>
      {!somenteLeitura && (
        <button
          type="button"
          onClick={() => aoMudar([...erros, { exemplo: '', pista: '', habilidade: habilidades[0] ?? '' }])}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" /> Erro comum
        </button>
      )}
    </div>
  )
}

export function BotaoIcone({
  rotulo,
  Icone,
  aoClicar,
}: {
  rotulo: string
  Icone: typeof Trash2
  aoClicar?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={!aoClicar}
      onClick={aoClicar}
      className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
    >
      <Icone className="h-4 w-4" />
    </button>
  )
}

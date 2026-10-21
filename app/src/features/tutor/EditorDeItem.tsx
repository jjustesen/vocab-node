import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { ELOGIOS, OPCOES_DE_ELOGIO, textoDaFala } from '../../../../poc-tutor/src/falas.ts'
import type { ErroPrevisto, Item, TipoItem } from '../../../../poc-tutor/src/tipos.ts'
import type { FalaFixa, Tocador } from './audiosDaLicao'
import { Area, Campo, Linhas } from './campos'
import { useSomenteLeitura } from './edicao'
import { slug } from './slug'

/** As falas fixas DESTE exercício, o que já está gravado e o player da página. */
export type AudiosDoItem = { falas: FalaFixa[]; gravadas: Set<string>; tocador: Tocador }

const ROTULO_DO_TIPO: Record<TipoItem, string> = {
  construcao: 'Construção',
  substituicao: 'Substituição',
  transformacao: 'Transformação',
  repeticao: 'Repetição',
  conversa: 'Conversa',
}

const EXPLICACAO_DO_TIPO: Record<TipoItem, string> = {
  construcao:
    'O tutor pede em português ("Diga em inglês: …") e o aluno monta a frase. Começa uma frase nova: as substituições seguintes partem dela.',
  substituicao:
    'O tutor diz só a pista e o aluno repete a ÚLTIMA frase aceita trocando o que a pista indica. A IA confere se o resto da frase foi mantido.',
  transformacao:
    'O tutor diz uma frase em inglês e o que fazer com ela (negativa, pergunta, passado…). É o "Change into…" dos drillings. Começa uma frase nova.',
  repeticao:
    'O tutor diz a frase e o aluno repete. Serve de aquecimento, mas nunca conta como "feito sozinho" no resultado — por isso use pouco.',
  conversa:
    'Uma pergunta real sobre a vida do aluno, no fim da aula. Não há resposta certa: a IA aceita qualquer resposta pertinente, conforme o critério.',
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
  audios,
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
  audios?: AudiosDoItem
}) {
  const [aberto, setAberto] = useState(false)
  const somenteLeitura = useSomenteLeitura()
  // A primeira fala do exercício é o pedido ("Diga em inglês: …") — o play da linha fechada.
  const pedidoGravado = audios?.falas.find((f) => audios.gravadas.has(f.chave))
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
        {pedidoGravado && audios && (
          <BotaoOuvir chave={pedidoGravado.chave} tocador={audios.tocador} rotulo={textoDaFala(pedidoGravado.fala)} />
        )}
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
                  disabled={somenteLeitura}
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
              ajuda='O tutor lê em voz alta: "Diga em inglês: <isto>". Escreva como você pediria em aula, sem a resposta em inglês.'
              valor={item.solicitacao}
              aoMudar={(v) => mudar({ solicitacao: v })}
              placeholder="eu falo inglês"
            />
          )}
          {item.tipo === 'substituicao' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Campo
                rotulo="Pista"
                ajuda="O tutor diz só isto. Curta: uma palavra ou um pedaço (alemão, Yesterday., não quero)."
                valor={item.pista}
                aoMudar={(v) => mudar({ pista: v })}
                placeholder="alemão"
              />
              <label className="text-xs font-bold text-neutral-600">
                A pista é dita em
                <select
                  value={item.idiomaDaPista ?? 'en'}
                  disabled={somenteLeitura}
                  onChange={(e) => mudar({ idiomaDaPista: e.target.value === 'pt' ? 'pt' : undefined })}
                  className="mt-1 block rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal"
                >
                  <option value="pt">português</option>
                  <option value="en">inglês</option>
                </select>
                <span className="mt-1 block text-[11px] font-normal text-neutral-400">Muda a voz: "alemão" lido pela voz em inglês sai errado.</span>
              </label>
            </div>
          )}
          {(item.tipo === 'repeticao' || item.tipo === 'transformacao') && (
            <Campo
              rotulo={item.tipo === 'repeticao' ? 'Frase para repetir' : 'Frase que o tutor diz (em inglês)'}
              ajuda={
                item.tipo === 'repeticao'
                  ? 'O tutor diz esta frase e o aluno repete. Ela também vale como resposta esperada.'
                  : 'A frase de partida, lida pela voz em inglês. O aluno não diz esta: diz a transformada.'
              }
              valor={item.modelo}
              aoMudar={(v) => mudar({ modelo: v, ...(item.tipo === 'repeticao' ? { alvo: v } : {}) })}
              ingles
              placeholder="I eat bread."
            />
          )}
          {item.tipo === 'transformacao' && (
            <Campo
              rotulo="O que o aluno faz com a frase"
              ajuda='Dito em português antes da frase ("Passe para a negativa: …"). A IA usa isto para saber que transformação conferir.'
              valor={item.instrucao}
              aoMudar={(v) => mudar({ instrucao: v })}
              placeholder="Passe para a negativa"
            />
          )}
          {item.tipo === 'conversa' && (
            <>
              <Campo
                rotulo="Pergunta (em inglês)"
                ajuda="O tutor faz esta pergunta como numa conversa de verdade."
                valor={item.pergunta}
                aoMudar={(v) => mudar({ pergunta: v })}
                ingles
              />
              <Area
                rotulo="O que conta como resposta"
                ajuda='É o que a IA usa para aceitar ou não. Diga o que precisa aparecer ("diz uma comida usando I like ou I don&apos;t like"). Erros fora disso não impedem a resposta de valer.'
                valor={item.criterio}
                aoMudar={(v) => mudar({ criterio: v })}
                linhas={2}
              />
              <Linhas
                rotulo="Exemplos de resposta"
                ajuda="Uma por linha. A IA usa como referência do que é pertinente; o aluno não vê. Não precisam ser as únicas certas."
                valor={item.exemplos}
                aoMudar={(v) => mudar({ exemplos: v })}
                ingles
              />
              <Linhas
                rotulo="Perguntas para continuar a conversa"
                ajuda="Por enquanto ficam só guardadas: o tutor ainda não faz perguntas de seguimento."
                valor={item.acompanhamentos}
                aoMudar={(v) => mudar({ acompanhamentos: v })}
                ingles
              />
            </>
          )}

          {item.tipo !== 'conversa' && <EscolhaDoElogio elogio={item.elogio} aoMudar={(elogio) => mudar({ elogio })} />}

          {item.tipo !== 'conversa' && item.tipo !== 'repeticao' && (
            <>
              <Campo
                rotulo="Resposta esperada"
                ajuda="A IA compara a resposta do aluno com esta — maiúscula, pontuação e hesitação não contam. É também a frase que o tutor diz quando o aluno não consegue, e a base da próxima substituição."
                valor={item.alvo}
                aoMudar={(v) => mudar({ alvo: v })}
                ingles
              />
              <Linhas
                rotulo="Outras respostas aceitas"
                ajuda="Uma por linha. A IA já aceita contração e forma cheia; liste o que ela poderia recusar sem querer: outra ordem, um sinônimo, um jeito igualmente natural."
                valor={item.variantes}
                aoMudar={(v) => mudar({ variantes: v.length ? v : undefined })}
                ingles
              />
            </>
          )}

          <Campo
            rotulo="Habilidades"
            ajuda='Separadas por vírgula, o que este exercício treina (ex.: negativa_dont, passado_irregular). Mudam três coisas: quando o aluno erra, a IA diz qual destas falhou; o tutor anota essa dificuldade e volta a ela depois, num exercício de Revisão da mesma habilidade; e ela aparece no fim da aula ("Para revisar: …"). Use o MESMO nome em todos os exercícios que treinam a mesma coisa.'
            valor={item.habilidades.join(', ')}
            aoMudar={(v) => mudar({ habilidades: v.split(',').map((h) => h.trim()).filter(Boolean).map(slug) })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Area
                key={i}
                rotulo={`Dica ${i + 1}${i === 0 ? ' (mais geral)' : ' (mais específica)'}`}
                ajuda={
                  i === 0
                    ? 'Dita no primeiro erro, quando ele não está nos Erros comuns. Em português, de preferência uma pergunta que faça o aluno achar o erro sozinho.'
                    : 'Dita no segundo erro. Mais perto da resposta, mas ainda sem dizê-la — no terceiro o tutor diz a frase inteira.'
                }
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
              <span className="block text-[11px] font-normal text-neutral-400">
                Se a IA perceber que falta a BASE (não um erro pontual), o tutor para, monta a frase por partes com este passo a
                passo e volta aqui.
              </span>
              Passo a passo quando faltar a base
              <select
                value={item.apoio ?? ''}
                disabled={somenteLeitura}
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

          {audios && audios.falas.length > 0 && <AudiosDoExercicio audios={audios} />}
        </div>
      )}
    </li>
  )
}

/** O que o tutor diz NESTE exercício (pedido, modelo, dicas…), cada fala com o play se já estiver gravada. */
function AudiosDoExercicio({ audios }: { audios: AudiosDoItem }) {
  const gravadas = audios.falas.filter((f) => audios.gravadas.has(f.chave)).length
  return (
    <div>
      <p className="text-xs font-bold text-neutral-600">
        O que o tutor diz neste exercício{' '}
        <span className="font-semibold text-neutral-400">
          · {gravadas} de {audios.falas.length} gravadas
        </span>
      </p>
      <ul className="mt-1.5 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {audios.falas.map((f) => (
          <li key={f.chave} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
            {audios.gravadas.has(f.chave) ? (
              <BotaoOuvir chave={f.chave} tocador={audios.tocador} rotulo={textoDaFala(f.fala)} />
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center text-neutral-300" title="Ainda não gravada">
                —
              </span>
            )}
            <span className="min-w-0 flex-1 text-neutral-700">{textoDaFala(f.fala)}</span>
          </li>
        ))}
      </ul>
      {gravadas < audios.falas.length && (
        <p className="mt-1 text-[11px] text-neutral-400">As que faltam se geram no painel Áudios, no fim da página.</p>
      )}
    </div>
  )
}

function BotaoOuvir({ chave, tocador, rotulo }: { chave: string; tocador: Tocador; rotulo: string }) {
  const tocando = tocador.tocando === chave
  return (
    <button
      type="button"
      onClick={() => tocador.tocar(chave)}
      aria-label={tocando ? 'Parar' : `Ouvir: ${rotulo}`}
      title={tocando ? 'Parar' : 'Ouvir'}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700 transition hover:bg-violet-200"
    >
      {tocando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
    </button>
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
      <p className="text-[11px] text-neutral-400">
        Os erros que você já sabe que o aluno vai cometer. Quando a IA reconhece um deles, o tutor usa a SUA dica em vez da
        Dica 1 — a correção fica do jeito que você faria. A habilidade diz o que o erro mostra.
      </p>
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
                  disabled={somenteLeitura}
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

/**
 * O elogio depois do acerto de primeira deste exercício. Desligado é o padrão:
 * sem elogio a aula anda mais rápido. Ligado, varia entre os de ELOGIOS ou fica
 * sempre num só.
 */
function EscolhaDoElogio({ elogio, aoMudar }: { elogio: Item['elogio']; aoMudar: (e: Item['elogio']) => void }) {
  const somenteLeitura = useSomenteLeitura()
  const frase = elogio?.frase ?? ''
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-bold text-neutral-600">
        <input
          type="checkbox"
          checked={Boolean(elogio)}
          disabled={somenteLeitura}
          onChange={(e) => aoMudar(e.target.checked ? {} : undefined)}
          className="h-4 w-4 accent-violet-600"
        />
        Elogiar quando o aluno acerta de primeira
      </label>
      {elogio && (
        <select
          aria-label="Qual elogio"
          value={frase}
          disabled={somenteLeitura}
          onChange={(e) => aoMudar(e.target.value ? { frase: e.target.value } : {})}
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 disabled:bg-neutral-50"
        >
          <option value="">Variar entre {ELOGIOS.join(' · ')}</option>
          {OPCOES_DE_ELOGIO.map((o) => (
            <option key={o} value={o}>
              Sempre “{o}”
            </option>
          ))}
        </select>
      )}
      <p className="mt-1 text-[11px] text-neutral-400">
        Desligado (o padrão), o tutor não diz nada depois do acerto e já passa para a próxima frase — a aula fica mais
        dinâmica. Vale só para este exercício. Depois de uma ajuda ele sempre diz “Isso, agora sim.”, para o aluno saber
        que agora acertou.
      </p>
    </div>
  )
}

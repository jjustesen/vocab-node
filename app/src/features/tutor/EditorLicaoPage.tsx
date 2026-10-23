import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Copy, Loader2, Play, Plus, Save, Trash2 } from 'lucide-react'
import { BotaoApagar } from '@/components/BotaoApagar'
import { Chave } from '@/components/Interruptor'
import type { NivelCefr } from '@/types/db'
import { avisosDoRoteiro, todosOsItens, validarRoteiro } from '../../../../poc-tutor/src/validacao.ts'
import type { Item, Roteiro, TipoItem } from '../../../../poc-tutor/src/tipos.ts'
import { useCopiarLicao, useExcluirLicao, useLicao, useSalvarLicao } from './api'
import { type FalaFixa, useFalasDaLicao, useGeradorDeFala, useTocador } from './audiosDaLicao'
import { Area, Campo, Linhas, Secao } from './campos'
import { SomenteLeitura } from './edicao'
import { slug } from './slug'
import { type AudiosDoItem, BotaoIcone, EditorDeItem } from './EditorDeItem'
import { PainelAudios } from './PainelAudios'

const NIVEIS: NivelCefr[] = ['A1', 'A2', 'B1', 'B2', 'C1']
const TIPOS_DO_BLOCO: TipoItem[] = ['construcao', 'substituicao', 'transformacao', 'repeticao', 'modelagem']
const TIPOS_DA_REVISAO: TipoItem[] = ['construcao', 'transformacao', 'substituicao']

/** A primeira frase da aula é a que mede se o aluno precisa de modelo: o editor garante que só ela tem a marca. */
function normalizar(r: Roteiro): Roteiro {
  const n = structuredClone(r)
  n.blocos.forEach((b, i) =>
    b.itens.forEach((item, j) => {
      if (i === 0 && j === 0) item.calibracao = true
      else delete item.calibracao
    }),
  )
  return n
}

function mover<T>(lista: T[], i: number, delta: number): T[] {
  const j = i + delta
  if (j < 0 || j >= lista.length) return lista
  const nova = [...lista]
  ;[nova[i], nova[j]] = [nova[j], nova[i]]
  return nova
}

/** Um id que ainda não existe na lição: `prefixo.N`. */
function novoId(r: Roteiro, prefixo: string): string {
  const usados = new Set(todosOsItens(r).map((i) => i.id))
  let n = 1
  while (usados.has(`${prefixo}.${n}`)) n++
  return `${prefixo}.${n}`
}

function itemVazio(r: Roteiro, prefixo: string, tipo: TipoItem): Item {
  return { id: novoId(r, prefixo), tipo, habilidades: [] }
}

/**
 * /tutor/licoes/:id — o editor da lição do tutor: tudo o que o tutor pede,
 * aceita, dica e corrige, mais as "regras para a IA" que o avaliador segue.
 * O rascunho fica em estado local até Salvar; `validarRoteiro` aponta o que
 * quebraria a aula (e impede publicar) e `avisosDoRoteiro` o que a deixaria pior.
 * Lição da biblioteca abre só para leitura.
 */
export function EditorLicaoPage() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { data: licao, isLoading, error } = useLicao(id)
  const salvar = useSalvarLicao()
  const excluir = useExcluirLicao()
  const copiar = useCopiarLicao()
  const tocador = useTocador()
  const gerador = useGeradorDeFala(id)
  const [rascunho, setRascunho] = useState<Roteiro | null>(null)
  const [nivel, setNivel] = useState<NivelCefr | null>(null)
  const [publicada, setPublicada] = useState(false)

  // Recomeça do salvo quando a lição chega ou é salva (o atualizado_em muda).
  useEffect(() => {
    if (!licao) return
    setRascunho(structuredClone(licao.roteiro))
    setNivel(licao.nivel_cefr)
    setPublicada(licao.publicada)
  }, [licao?.id, licao?.atualizado_em]) // eslint-disable-line react-hooks/exhaustive-deps

  const normalizado = useMemo(() => (rascunho ? normalizar(rascunho) : null), [rascunho])
  const salvoJson = useMemo(() => (licao ? JSON.stringify(normalizar(licao.roteiro)) : ''), [licao])
  // O painel Áudios recalcula as falas quando o roteiro salvo MUDA, não a cada nova busca da linha.
  const roteiroSalvo = useMemo(() => (salvoJson ? (JSON.parse(salvoJson) as Roteiro) : null), [salvoJson])
  const falas = useFalasDaLicao(roteiroSalvo)
  const gravadas = useMemo(() => new Set(licao?.falas_gravadas ?? []), [licao?.falas_gravadas])
  // Cada exercício mostra as falas que são SÓ dele; as que o tutor diz em vários ("Muito bem.") ficam no painel Áudios.
  const falasPorItem = useMemo(() => {
    const mapa = new Map<string, FalaFixa[]>()
    for (const f of falas ?? []) {
      if (f.itens.length !== 1) continue
      const lista = mapa.get(f.itens[0]) ?? []
      lista.push(f)
      mapa.set(f.itens[0], lista)
    }
    return mapa
  }, [falas])
  // Os exercícios que mudaram desde o Salvar: as falas deles no painel ainda são as do texto salvo.
  const itensMudados = useMemo(() => {
    if (!normalizado || !roteiroSalvo) return new Set<string>()
    const salvos = new Map(todosOsItens(roteiroSalvo).map((i) => [i.id, JSON.stringify(i)]))
    return new Set(todosOsItens(normalizado).filter((i) => salvos.get(i.id) !== JSON.stringify(i)).map((i) => i.id))
  }, [normalizado, roteiroSalvo])
  // Áudios de textos que já não existem (o exercício mudou) ficam em falas_gravadas: contam só os das falas atuais.
  const gravadasAtuais = falas ? falas.filter((f) => gravadas.has(f.chave)).length : (licao?.falas_gravadas.length ?? 0)
  const problemas = useMemo(() => (normalizado ? validarRoteiro(normalizado) : []), [normalizado])
  const avisos = useMemo(() => (normalizado ? avisosDoRoteiro(normalizado) : []), [normalizado])

  if (isLoading || (licao && !rascunho)) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  if (error || !licao || !rascunho || !normalizado || !roteiroSalvo) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
        <p className="font-bold text-neutral-700">Lição não encontrada</p>
        <Link to="/tutor" className="mt-3 inline-block text-sm font-bold underline">
          Voltar às lições
        </Link>
      </div>
    )
  }

  const somenteLeitura = !licao.professor_id
  const sujo = JSON.stringify(normalizado) !== salvoJson || nivel !== licao.nivel_cefr || publicada !== licao.publicada
  const audiosDe = (itemId: string): AudiosDoItem | undefined =>
    falas
      ? {
          falas: falasPorItem.get(itemId) ?? [],
          gravadas,
          tocador,
          gerador: somenteLeitura ? undefined : gerador,
          temMudancas: sujo,
          mudouDesdeSalvo: itensMudados.has(itemId),
        }
      : undefined
  const r = rascunho
  const mudar = (f: (n: Roteiro) => void) =>
    setRascunho((anterior) => {
      const n = structuredClone(anterior!)
      f(n)
      return n
    })
  const apoios = Object.entries(r.apoios).map(([apoioId, a]) => ({ id: apoioId, objetivo: a.objetivo }))
  const habilidadesUsadas = [
    ...new Set(
      todosOsItens(normalizado).flatMap((i) => [...i.habilidades, ...(i.errosPrevistos ?? []).map((e) => e.habilidade)]),
    ),
  ].filter(Boolean)

  async function gravar() {
    if (publicada && problemas.length) return
    await salvar.mutateAsync({ id: licao!.id, roteiro: normalizado!, nivel, publicada })
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link to="/tutor" className="inline-flex items-center gap-1 text-sm font-bold text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> Lições
      </Link>

      <input
        value={r.titulo}
        readOnly={somenteLeitura}
        onChange={(e) => mudar((n) => void (n.titulo = e.target.value))}
        aria-label="Título da lição"
        className="mt-2 w-full bg-transparent text-2xl font-extrabold outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-neutral-600">
          Nível
          <select
            value={nivel ?? ''}
            disabled={somenteLeitura}
            onChange={(e) => setNivel((e.target.value || null) as NivelCefr | null)}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">—</option>
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {!somenteLeitura && (
          <label className="flex items-center gap-2 text-sm font-bold text-neutral-600">
            <Chave
              rotulo="Publicada"
              ligado={publicada}
              desabilitado={!publicada && problemas.length > 0}
              aoMudar={setPublicada}
            />
            {publicada ? 'Publicada' : 'Rascunho'}
          </label>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {sujo ? (
            <span className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-bold text-neutral-400" title="Salve para experimentar a versão nova">
              <Play className="mr-1 inline h-4 w-4" />
              Experimentar
            </span>
          ) : (
            <Link
              to={`/tutor/licoes/${licao.id}/experimentar`}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold"
            >
              <Play className="h-4 w-4" /> Experimentar
            </Link>
          )}
          {!somenteLeitura && (
            <>
              <button
                type="button"
                onClick={() => void gravar()}
                disabled={!sujo || salvar.isPending || (publicada && problemas.length > 0)}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
              <BotaoApagar
                titulo="Excluir lição"
                confirmacao="Excluir?"
                pendente={excluir.isPending}
                aoConfirmar={() => excluir.mutate(licao.id, { onSuccess: () => navegar('/tutor') })}
              />
            </>
          )}
        </span>
      </div>

      {!somenteLeitura && (
        <p className="mt-2 text-[11px] text-neutral-400">
          Nível: só organiza a lição na sua lista, não muda como a IA corrige. Publicada: só lição publicada pode ser liberada
          para um aluno; em rascunho você ainda pode experimentar.
        </p>
      )}
      {somenteLeitura && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          <span className="min-w-0 flex-1">
            Lição da biblioteca do Vocab Node: dá para ler, ouvir e experimentar. Para mudar alguma coisa, faça uma cópia
            sua — os áudios vêm junto.
          </span>
          <button
            type="button"
            onClick={() => copiar.mutate(licao, { onSuccess: (novo) => navegar(`/tutor/licoes/${novo}`) })}
            disabled={copiar.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {copiar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Copiar para minhas lições
          </button>
        </div>
      )}
      {copiar.isError && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Não consegui copiar a lição. Tente de novo.
        </p>
      )}
      {salvar.isError && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Não consegui salvar. Verifique sua internet e tente de novo.
        </p>
      )}
      {publicada && problemas.length > 0 && !somenteLeitura && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          A lição está publicada, mas tem problemas: corrija-os ou volte para rascunho antes de salvar.
        </p>
      )}

      {(problemas.length > 0 || avisos.length > 0) && (
        <div className="mt-4 space-y-2">
          {problemas.length > 0 && (
            <ListaDeAvisos
              titulo={`${problemas.length} ${problemas.length === 1 ? 'problema impede' : 'problemas impedem'} publicar`}
              cor="rose"
              itens={problemas}
            />
          )}
          {avisos.length > 0 && <ListaDeAvisos titulo={`${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}`} cor="amber" itens={avisos} />}
        </div>
      )}

      <SomenteLeitura.Provider value={somenteLeitura}>
      <div className="mt-6 space-y-3">
        <Secao titulo="Abertura e regras para a IA" resumo="O que o tutor diz ao começar e o que o avaliador respeita" abertaDeInicio>
          <Area
            rotulo="Abertura"
            ajuda="A primeira fala do tutor, em voz, ao começar a aula. Uma frase dizendo o que vamos praticar. Não muda a correção."
            valor={r.abertura} linhas={2} aoMudar={(v) => mudar((n) => void (n.abertura = v))} />
          <Area
            rotulo="Regras para a IA"
            ajuda={'É o campo que mais muda a correção: a IA lê isto a cada resposta do aluno. Escreva o que é certo, o que é erro e o que vale igual nesta lição — ex.: "I\'m 30 e I\'m 30 years old valem; I have 30 years é erro". Sem isto ela usa o próprio bom senso e pode aceitar ou recusar o que você não esperava.'}
            valor={r.notasParaAvaliador}
            linhas={4}
            aoMudar={(v) => mudar((n) => void (n.notasParaAvaliador = v || undefined))}
          />
        </Secao>

        <Secao titulo="Folha de apoio do aluno" resumo="Estruturas, vocabulário, exemplos e alertas — nunca as respostas dos exercícios">
          <p className="text-xs text-neutral-500">
            O aluno abre esta folha pelo botão de livro durante a aula. A IA não a usa para corrigir. Mostre o padrão (I + verbo),
            nunca a frase pronta de um exercício: o aluno leria em vez de produzir — o editor avisa quando isso acontece.
          </p>
          <Linhas rotulo="Estruturas" ajuda="Uma por linha: os padrões da lição (I don't + verbo, Did you + verbo…?)." valor={r.painel.estruturas} aoMudar={(v) => mudar((n) => void (n.painel.estruturas = v))} ingles />
          <Linhas
            rotulo="Vocabulário"
            ajuda="Uma palavra por linha, no formato: inglês = português"
            valor={r.painel.vocabulario.map((v) => `${v.en} = ${v.pt}`)}
            aoMudar={(linhas) =>
              mudar(
                (n) =>
                  void (n.painel.vocabulario = linhas.map((l) => {
                    const [en, ...pt] = l.split('=')
                    return { en: en.trim(), pt: pt.join('=').trim() }
                  })),
              )
            }
          />
          <Linhas rotulo="Exemplos" ajuda="Uma por linha: frases de exemplo que NÃO sejam respostas dos exercícios (outro sujeito, outra palavra)." valor={r.painel.exemplos} aoMudar={(v) => mudar((n) => void (n.painel.exemplos = v))} ingles />
          <Linhas rotulo="Alertas" ajuda='Uma por linha: as armadilhas da lição ("I have 30 years" está errado: idade usa to be).' valor={r.painel.alertas} aoMudar={(v) => mudar((n) => void (n.painel.alertas = v))} />
        </Secao>

        <h2 className="pt-4 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Exercícios</h2>
        {r.blocos.map((bloco, bi) => (
          <Secao
            key={bloco.id}
            titulo={r.nomes?.blocos?.[bloco.id] ?? bloco.id}
            resumo={`${bloco.itens.length} ${bloco.itens.length === 1 ? 'item' : 'itens'} · ${bloco.objetivo}`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                rotulo="Nome do bloco"
                ajuda="Aparece para o aluno na barra de progresso."
                valor={r.nomes?.blocos?.[bloco.id]}
                aoMudar={(v) =>
                  mudar((n) => {
                    n.nomes = { ...n.nomes, blocos: { ...n.nomes?.blocos, [bloco.id]: v } }
                  })
                }
              />
              <Campo
                rotulo="Objetivo"
                ajuda="Só para você se orientar: o aluno não vê e a IA não usa."
                valor={bloco.objetivo}
                aoMudar={(v) => mudar((n) => void (n.blocos[bi].objetivo = v))}
              />
            </div>
            <ul className="space-y-2">
              {bloco.itens.map((item, ii) => (
                <EditorDeItem
                  key={item.id}
                  numero={ii + 1}
                  item={item}
                  tipos={TIPOS_DO_BLOCO}
                  apoios={apoios}
                  audios={audiosDe(item.id)}
                  aoMudar={(novo) => mudar((n) => void (n.blocos[bi].itens[ii] = novo))}
                  aoRemover={() => mudar((n) => void n.blocos[bi].itens.splice(ii, 1))}
                  aoSubir={ii > 0 ? () => mudar((n) => void (n.blocos[bi].itens = mover(n.blocos[bi].itens, ii, -1))) : undefined}
                  aoDescer={
                    ii < bloco.itens.length - 1 ? () => mudar((n) => void (n.blocos[bi].itens = mover(n.blocos[bi].itens, ii, 1))) : undefined
                  }
                />
              ))}
            </ul>
            {!somenteLeitura && (
              <div className="flex flex-wrap items-center gap-2">
                <AdicionarItem
                  tipos={TIPOS_DO_BLOCO}
                  aoEscolher={(tipo) => mudar((n) => void n.blocos[bi].itens.push(itemVazio(n, bloco.id, tipo)))}
                />
                <span className="ml-auto flex gap-0.5">
                  <BotaoIcone rotulo="Subir bloco" Icone={ArrowUp} aoClicar={bi > 0 ? () => mudar((n) => void (n.blocos = mover(n.blocos, bi, -1))) : undefined} />
                  <BotaoIcone
                    rotulo="Descer bloco"
                    Icone={ArrowDown}
                    aoClicar={bi < r.blocos.length - 1 ? () => mudar((n) => void (n.blocos = mover(n.blocos, bi, 1))) : undefined}
                  />
                  <BotaoIcone rotulo="Remover bloco" Icone={Trash2} aoClicar={() => mudar((n) => void n.blocos.splice(bi, 1))} />
                </span>
              </div>
            )}
          </Secao>
        ))}
        {!somenteLeitura && (
          <button
            type="button"
            onClick={() =>
              mudar((n) => {
                let blocoId = 'bloco'
                for (let k = 2; n.blocos.some((b) => b.id === blocoId); k++) blocoId = `bloco_${k}`
                n.blocos.push({ id: blocoId, objetivo: '', itens: [itemVazio(n, blocoId, 'construcao')] })
                n.nomes = { ...n.nomes, blocos: { ...n.nomes?.blocos, [blocoId]: 'Novo bloco' } }
              })
            }
            className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold"
          >
            <Plus className="h-4 w-4" /> Bloco
          </button>
        )}

        <h2 className="pt-4 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Depois dos exercícios</h2>
        <Secao titulo="Conversa" resumo={`${r.conversa.length} perguntas sobre a vida do aluno, no fim da aula`}>
          <ul className="space-y-2">
            {r.conversa.map((item, ii) => (
              <EditorDeItem
                key={item.id}
                numero={ii + 1}
                item={item}
                tipos={['conversa']}
                apoios={[]}
                audios={audiosDe(item.id)}
                aoMudar={(novo) => mudar((n) => void (n.conversa[ii] = novo))}
                aoRemover={() => mudar((n) => void n.conversa.splice(ii, 1))}
                aoSubir={ii > 0 ? () => mudar((n) => void (n.conversa = mover(n.conversa, ii, -1))) : undefined}
                aoDescer={ii < r.conversa.length - 1 ? () => mudar((n) => void (n.conversa = mover(n.conversa, ii, 1))) : undefined}
              />
            ))}
          </ul>
          {!somenteLeitura && (
            <button
              type="button"
              onClick={() => mudar((n) => void n.conversa.push(itemVazio(n, 'conversa', 'conversa')))}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5" /> Pergunta
            </button>
          )}
        </Secao>

        <Secao
          titulo="Revisão"
          resumo="Quando o aluno precisou de ajuda numa habilidade, o tutor volta a ela depois, numa frase nova"
        >
          <p className="text-xs text-neutral-500">
            Um exercício por habilidade. Se o aluno precisou de ajuda numa habilidade, o tutor faz o exercício de revisão dela
            depois de outro bloco (ou no fim da aula). Acertando sozinho, conta como recuperada no resultado; sem revisão, a
            habilidade fica só como "para revisar". Use uma frase nova, não a mesma do exercício.
          </p>
          <ul className="space-y-3">
            {Object.entries(r.recuperacao).map(([habilidade, item], ii) => (
              <li key={habilidade}>
                <p className="mb-1 text-xs font-bold text-neutral-600">{habilidade.replaceAll('_', ' ')}</p>
                <ul>
                  <EditorDeItem
                    numero={ii + 1}
                    item={item}
                    tipos={TIPOS_DA_REVISAO}
                    apoios={[]}
                    audios={audiosDe(item.id)}
                    aoMudar={(novo) => mudar((n) => void (n.recuperacao[habilidade] = novo))}
                    aoRemover={() => mudar((n) => void delete n.recuperacao[habilidade])}
                  />
                </ul>
              </li>
            ))}
          </ul>
          {!somenteLeitura && (
            <AdicionarRevisao
              habilidades={habilidadesUsadas.filter((h) => !r.recuperacao[h])}
              aoEscolher={(habilidade) =>
                mudar((n) => {
                  n.recuperacao[habilidade] = { ...itemVazio(n, `rec.${habilidade}`, 'construcao'), habilidades: [habilidade] }
                })
              }
            />
          )}
        </Secao>

        <Secao titulo="Passo a passo" resumo="Escadas para quando falta a base: o tutor monta a frase por partes e volta ao exercício">
          <p className="text-xs text-neutral-500">
            Uma sequência curta de exercícios que constrói a base que faltou (ex.: o did na pergunta). Só entra quando a IA
            percebe que o aluno não tem a base — não num erro pontual — e quando o exercício está ligado a ela, no campo "Passo a
            passo quando faltar a base". Ao terminar, o tutor volta ao exercício de onde saiu.
          </p>
          {Object.entries(r.apoios).map(([apoioId, apoio]) => (
            <div key={apoioId} className="space-y-2 rounded-2xl bg-neutral-50 p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Campo rotulo="Objetivo" valor={apoio.objetivo} aoMudar={(v) => mudar((n) => void (n.apoios[apoioId].objetivo = v))} />
                </div>
                {!somenteLeitura && (
                  <BotaoIcone
                    rotulo="Remover passo a passo"
                    Icone={Trash2}
                    aoClicar={() =>
                      mudar((n) => {
                        delete n.apoios[apoioId]
                        for (const i of todosOsItens(n)) if (i.apoio === apoioId) delete i.apoio
                      })
                    }
                  />
                )}
              </div>
              <ul className="space-y-2">
                {apoio.degraus.map((item, ii) => (
                  <EditorDeItem
                    key={item.id}
                    numero={ii + 1}
                    item={item}
                    tipos={TIPOS_DO_BLOCO}
                    apoios={[]}
                    audios={audiosDe(item.id)}
                    aoMudar={(novo) => mudar((n) => void (n.apoios[apoioId].degraus[ii] = novo))}
                    aoRemover={() => mudar((n) => void n.apoios[apoioId].degraus.splice(ii, 1))}
                    aoSubir={ii > 0 ? () => mudar((n) => void (n.apoios[apoioId].degraus = mover(n.apoios[apoioId].degraus, ii, -1))) : undefined}
                    aoDescer={
                      ii < apoio.degraus.length - 1
                        ? () => mudar((n) => void (n.apoios[apoioId].degraus = mover(n.apoios[apoioId].degraus, ii, 1)))
                        : undefined
                    }
                  />
                ))}
              </ul>
              {!somenteLeitura && (
                <AdicionarItem
                  tipos={TIPOS_DO_BLOCO}
                  aoEscolher={(tipo) => mudar((n) => void n.apoios[apoioId].degraus.push(itemVazio(n, apoioId, tipo)))}
                />
              )}
            </div>
          ))}
          {!somenteLeitura && (
            <button
              type="button"
              onClick={() =>
                mudar((n) => {
                  let apoioId = 'passo_a_passo'
                  for (let k = 2; n.apoios[apoioId]; k++) apoioId = `passo_a_passo_${k}`
                  n.apoios[apoioId] = { objetivo: 'Montar a frase por partes', degraus: [itemVazio(n, apoioId, 'repeticao')] }
                })
              }
              className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5" /> Passo a passo
            </button>
          )}
        </Secao>

        <Secao titulo="Nomes das habilidades" resumo="Como cada habilidade aparece para o aluno e como o tutor fala dela no fim da aula">
          <p className="text-xs text-neutral-500">
            As habilidades são as etiquetas que você põe em cada exercício. Aqui elas ganham nome para o aluno: o selo aparece
            na tela quando ele precisa de ajuda nela (e fica verde quando recupera), e o tutor fala o nome no fim ("Para revisar:
            o didn&apos;t com o verbo na forma básica"). Não muda a correção.
          </p>
          <ul className="space-y-3">
            {habilidadesUsadas.map((h) => (
              <li key={h} className="grid gap-2 sm:grid-cols-[10rem_1fr_2fr] sm:items-end">
                <p className="text-sm font-bold text-neutral-700">{h.replaceAll('_', ' ')}</p>
                <Campo
                  rotulo="Selo na tela"
                  valor={r.nomes?.habilidades?.[h]?.curto}
                  placeholder="didn't"
                  aoMudar={(v) =>
                    mudar((n) => {
                      const atual = n.nomes?.habilidades?.[h] ?? { curto: '', resumo: '' }
                      n.nomes = { ...n.nomes, habilidades: { ...n.nomes?.habilidades, [h]: { ...atual, curto: v } } }
                    })
                  }
                />
                <Campo
                  rotulo="Como o tutor diz"
                  valor={r.nomes?.habilidades?.[h]?.resumo}
                  placeholder="o didn't com o verbo na forma básica"
                  aoMudar={(v) =>
                    mudar((n) => {
                      const atual = n.nomes?.habilidades?.[h] ?? { curto: '', resumo: '' }
                      n.nomes = { ...n.nomes, habilidades: { ...n.nomes?.habilidades, [h]: { ...atual, resumo: v } } }
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Áudios" resumo={`${gravadasAtuais}${falas ? ` de ${falas.length}` : ''} falas gravadas — ouça todas e gere as que faltam`}>
          <PainelAudios
            licaoId={licao.id}
            falas={falas}
            gravadas={gravadas}
            gasto={Number(licao.custo_audios_usd ?? 0)}
            tocador={tocador}
            gerador={gerador}
            podeGravar={!somenteLeitura}
            temMudancas={sujo}
          />
        </Secao>
      </div>
      </SomenteLeitura.Provider>
    </div>
  )
}

function ListaDeAvisos({ titulo, cor, itens }: { titulo: string; cor: 'rose' | 'amber'; itens: string[] }) {
  const [aberta, setAberta] = useState(false)
  const estilo = cor === 'rose' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${estilo}`}>
      <button type="button" onClick={() => setAberta(!aberta)} className="flex w-full items-center gap-2 text-left font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {titulo}
        <span className="ml-auto text-xs font-semibold underline">{aberta ? 'esconder' : 'ver'}</span>
      </button>
      {aberta && (
        <ul className="mt-2 list-disc space-y-1 pl-6 text-xs">
          {itens.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AdicionarItem({ tipos, aoEscolher }: { tipos: TipoItem[]; aoEscolher: (tipo: TipoItem) => void }) {
  const ROTULOS: Record<string, string> = {
    construcao: 'Construção',
    substituicao: 'Substituição',
    transformacao: 'Transformação',
    repeticao: 'Repetição',
    modelagem: 'Modelagem',
  }
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold">
      <Plus className="h-3.5 w-3.5" />
      <select
        value=""
        onChange={(e) => e.target.value && aoEscolher(e.target.value as TipoItem)}
        className="bg-transparent outline-none"
        aria-label="Adicionar item"
      >
        <option value="">Item…</option>
        {tipos.map((t) => (
          <option key={t} value={t}>
            {ROTULOS[t] ?? t}
          </option>
        ))}
      </select>
    </label>
  )
}

function AdicionarRevisao({ habilidades, aoEscolher }: { habilidades: string[]; aoEscolher: (h: string) => void }) {
  if (!habilidades.length) return <p className="text-xs text-neutral-400">Todas as habilidades da lição já têm revisão.</p>
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold">
      <Plus className="h-3.5 w-3.5" />
      <select
        value=""
        onChange={(e) => e.target.value && aoEscolher(slug(e.target.value))}
        className="bg-transparent outline-none"
        aria-label="Adicionar revisão"
      >
        <option value="">Revisão de…</option>
        {habilidades.map((h) => (
          <option key={h} value={h}>
            {h.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  )
}

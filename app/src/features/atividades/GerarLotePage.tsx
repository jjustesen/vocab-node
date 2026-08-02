import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronUp,
  Circle,
  Eye,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import { gerarAtividadeIA } from './api-ia'
import { useCriarAtividade } from './api'
import { AtividadeForm } from './AtividadeForm'
import { PersonalizarItemLoteModal } from './PersonalizarItemLoteModal'
import { Chip } from '@/components/Chip'
import { imagemParaMaterial, pdfParaMaterial } from '@/lib/arquivo'
import { useUsoDoMes } from '@/features/planos/api'
import { NIVEIS, HABILIDADES, ROTULO_HABILIDADE, type Questao } from '@/types/questao'
import {
  CONFIG_PADRAO,
  GERACOES_SIMULTANEAS,
  MAXIMO_ARQUIVOS_POR_LOTE,
  ehPersonalizado,
  resolverConfig,
  tamanhoLegivel,
  tituloDoArquivo,
  type ConfigGeracao,
  type ItemLote,
} from './lote'
import type { NivelCefr } from '@/types/db'

const TAMANHO_MAX_PDF = 15 * 1024 * 1024
const TAMANHO_MAX_IMAGEM = 32 * 1024 * 1024
const QUANTIDADES = [5, 10, 15, 20]

/**
 * P4b: mesma geração por IA do fluxo de um arquivo só (GerarAtividadePage),
 * repetida sobre N materiais. A orquestração roda AQUI, no navegador, chamando
 * a Edge Function `gerar-atividade` uma vez por arquivo — não há fila no
 * servidor, então a aba precisa ficar aberta até o lote terminar; é o que a
 * tela avisa em vez de prometer processamento em segundo plano.
 *
 * Duas garantias que o loop ingênuo não daria:
 *  - falha isolada não derruba o lote (cada item guarda seu próprio erro e
 *    pode ser refeito sozinho, sem regerar os que já deram certo);
 *  - nada é gravado durante a geração. As atividades só viram linha no banco
 *    quando o professor revisa e salva (RF-67/70), como rascunho.
 */
export function GerarLotePage() {
  const navigate = useNavigate()
  const criar = useCriarAtividade()
  const { data: uso } = useUsoDoMes()

  const [padrao, setPadrao] = useState<ConfigGeracao>(CONFIG_PADRAO)
  const [itens, setItens] = useState<ItemLote[]>([])
  const [fase, setFase] = useState<'montar' | 'gerando' | 'revisao'>('montar')
  const [processandoArquivos, setProcessandoArquivos] = useState(false)
  const [errosArquivo, setErrosArquivo] = useState<string[]>([])
  const [personalizandoId, setPersonalizandoId] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const cancelado = useRef(false)

  const restantes = uso ? Math.max(0, uso.limiteGeracoes - uso.geracoesDoMes) : null
  const excedeLimite = restantes !== null && itens.length > restantes

  // Fechar a aba no meio da geração perde o lote inteiro (nada foi gravado
  // ainda) — o aviso nativo é a única defesa possível sem fila no servidor.
  useEffect(() => {
    if (fase !== 'gerando') return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [fase])

  function atualizarItem(id: string, mudanca: Partial<ItemLote>) {
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, ...mudanca } : i)))
  }

  async function aoEscolherArquivos(evento: React.ChangeEvent<HTMLInputElement>) {
    const escolhidos = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    if (escolhidos.length === 0) return

    setErrosArquivo([])
    setProcessandoArquivos(true)
    const erros: string[] = []
    const novos: ItemLote[] = []

    for (const arquivo of escolhidos) {
      if (itens.length + novos.length >= MAXIMO_ARQUIVOS_POR_LOTE) {
        erros.push(`Limite de ${MAXIMO_ARQUIVOS_POR_LOTE} arquivos por lote — "${arquivo.name}" ficou de fora.`)
        continue
      }
      const ehPdf = arquivo.type === 'application/pdf'
      const ehImagem = arquivo.type.startsWith('image/')
      if (!ehPdf && !ehImagem) {
        erros.push(`"${arquivo.name}": envie PDF ou foto (JPG/PNG).`)
        continue
      }
      if (ehPdf && arquivo.size > TAMANHO_MAX_PDF) {
        erros.push(`"${arquivo.name}": PDF acima de 15MB.`)
        continue
      }
      if (ehImagem && arquivo.size > TAMANHO_MAX_IMAGEM) {
        erros.push(`"${arquivo.name}": foto acima de 32MB.`)
        continue
      }

      try {
        const material = ehPdf ? await pdfParaMaterial(arquivo) : await imagemParaMaterial(arquivo)
        novos.push({
          id: crypto.randomUUID(),
          nome: arquivo.name,
          tamanho: arquivo.size,
          tipo: ehPdf ? 'pdf' : 'imagem',
          ...material,
          override: {},
          estado: 'na_fila',
          selecionada: true,
        })
      } catch (e) {
        erros.push(`"${arquivo.name}": ${e instanceof Error ? e.message : 'não consegui processar.'}`)
      }
    }

    setItens((atual) => [...atual, ...novos])
    setErrosArquivo(erros)
    setProcessandoArquivos(false)
  }

  async function gerarUm(item: ItemLote) {
    atualizarItem(item.id, { estado: 'gerando', erro: undefined })
    try {
      const config = resolverConfig(padrao, item.override)
      const gerada = await gerarAtividadeIA({
        material: { tipo: item.tipo, conteudo: item.conteudo, mimeType: item.mimeType },
        nivel: config.nivel,
        quantidade: config.quantidade,
        habilidades: config.habilidades,
        foco: config.foco || undefined,
      })
      atualizarItem(item.id, { estado: 'pronta', gerada, selecionada: true })
    } catch (e) {
      atualizarItem(item.id, {
        estado: 'erro',
        erro: e instanceof Error ? e.message : 'Não consegui gerar a partir deste arquivo.',
      })
    }
  }

  /**
   * Pool de `GERACOES_SIMULTANEAS` trabalhadores sobre a mesma fila: cada um
   * puxa o próximo arquivo assim que termina o seu. Sequencial puro deixaria
   * 10 arquivos em ~15 minutos; paralelo total dispararia 10 chamadas ao
   * Gemini de uma vez e bateria em rate limit.
   */
  async function gerarLote(alvo: ItemLote[]) {
    cancelado.current = false
    setFase('gerando')
    const fila = [...alvo]
    const trabalhador = async () => {
      while (fila.length > 0 && !cancelado.current) {
        await gerarUm(fila.shift()!)
      }
    }
    await Promise.all(Array.from({ length: GERACOES_SIMULTANEAS }, trabalhador))
    setFase('revisao')
  }

  async function salvarSelecionadas() {
    setErroSalvar(null)
    setSalvando(true)
    const selecionadas = itens.filter((i) => i.estado === 'pronta' && i.selecionada && i.gerada)
    let salvas = 0
    try {
      for (const item of selecionadas) {
        await criar.mutateAsync({
          titulo: item.gerada!.titulo || tituloDoArquivo(item.nome),
          nivel: item.gerada!.nivel,
          habilidades: item.gerada!.habilidades,
          questoes: item.gerada!.questoes,
          origemIA: true,
          material: { tipo: item.tipo, conteudo: item.conteudo, mimeType: item.mimeType, nome: item.nome },
        })
        salvas += 1
        // Sai da lista assim que grava: se a próxima falhar, o retry não cria
        // duplicata das que já foram salvas.
        setItens((atual) => atual.filter((i) => i.id !== item.id))
      }
      navigate('/atividades')
    } catch (e) {
      setErroSalvar(
        `${salvas} de ${selecionadas.length} atividades foram salvas. ${
          e instanceof Error ? e.message : 'Erro ao salvar.'
        } As que faltam continuam aqui — tente de novo.`,
      )
    } finally {
      setSalvando(false)
    }
  }

  const editando = itens.find((i) => i.id === editandoId)
  if (editando?.gerada) {
    return (
      <AtividadeForm
        tituloPagina="Revisar atividade do lote"
        rotuloBotao="Aplicar alterações"
        valoresIniciais={{
          titulo: editando.gerada.titulo,
          nivel: editando.gerada.nivel,
          habilidades: editando.gerada.habilidades,
          questoes: editando.gerada.questoes,
        }}
        aoSalvar={async (dados) => {
          atualizarItem(editando.id, { gerada: { ...editando.gerada!, ...dados } })
          setEditandoId(null)
        }}
      />
    )
  }

  const personalizando = itens.find((i) => i.id === personalizandoId)
  const prontas = itens.filter((i) => i.estado === 'pronta')
  const selecionadas = prontas.filter((i) => i.selecionada)
  const comErro = itens.filter((i) => i.estado === 'erro')

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-violet-100 text-violet-700">
              {fase === 'revisao' ? <CheckCheck className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
            </span>
            <h1 className="text-2xl font-extrabold">
              {fase === 'revisao' ? `${prontas.length} atividades geradas` : 'Gerar atividades em lote'}
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-neutral-500">
            {fase === 'revisao'
              ? 'Revise antes de salvar. Elas entram como rascunho — nada vai para o aluno até você atribuir.'
              : 'Envie vários materiais de uma vez — cada arquivo vira uma atividade. A IA usa só o que está no arquivo, nunca inventa conteúdo novo.'}
          </p>
        </div>
        {fase === 'montar' && itens.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-neutral-500 hover:text-neutral-800">
            <input type="file" multiple accept="application/pdf,image/*" onChange={aoEscolherArquivos} className="hidden" />
            <Plus className="h-3.5 w-3.5" /> Adicionar mais arquivos
          </label>
        )}
      </div>

      {uso && fase === 'montar' && (
        <p
          className={`mt-3 rounded-2xl px-4 py-3 text-sm font-medium ${
            excedeLimite || restantes === 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {excedeLimite
            ? `Você tem ${restantes} gerações restantes este mês e o lote tem ${itens.length} arquivos — remova alguns para continuar.`
            : `Você tem ${restantes} de ${uso.limiteGeracoes} gerações restantes este mês — cada arquivo do lote consome uma.`}
        </p>
      )}

      {errosArquivo.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errosArquivo.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}

      {fase === 'montar' && itens.length === 0 && (
        <div className="mt-5 rounded-3xl bg-white p-5">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-16 text-center transition hover:border-neutral-400">
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              onChange={aoEscolherArquivos}
              disabled={processandoArquivos}
              className="hidden"
            />
            {processandoArquivos ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                <span className="text-base font-extrabold text-neutral-600">Processando arquivos...</span>
              </>
            ) : (
              <>
                <UploadCloud className="h-7 w-7 text-neutral-400" />
                <span className="text-base font-extrabold text-neutral-700">Escolha os arquivos do lote</span>
                <span className="text-sm font-bold text-neutral-500">
                  até {MAXIMO_ARQUIVOS_POR_LOTE} por vez — cada um vira uma atividade
                </span>
                <span className="mt-1 text-xs text-neutral-400">PDF até 15MB · JPG/PNG até 32MB</span>
              </>
            )}
          </label>
        </div>
      )}

      {fase === 'montar' && itens.length > 0 && (
        <>
          <section className="mt-5 rounded-3xl bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-200 text-xs font-extrabold text-emerald-800">
                  1
                </span>
                Configuração padrão <span className="font-medium text-neutral-400">— vale para todos os arquivos</span>
              </h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                aplicada a {itens.filter((i) => !ehPersonalizado(i)).length} de {itens.length}
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Campo rotulo="Nível">
                  {NIVEIS.map((n) => (
                    <Chip key={n} ativo={padrao.nivel === n} aoClicar={() => setPadrao({ ...padrao, nivel: n as NivelCefr })}>
                      {n}
                    </Chip>
                  ))}
                </Campo>
                <Campo rotulo="Questões por atividade">
                  {QUANTIDADES.map((q) => (
                    <Chip key={q} ativo={padrao.quantidade === q} aoClicar={() => setPadrao({ ...padrao, quantidade: q })}>
                      {q}
                    </Chip>
                  ))}
                </Campo>
              </div>
              <div>
                <Campo rotulo="Habilidades">
                  {HABILIDADES.map((h) => (
                    <Chip
                      key={h}
                      ativo={padrao.habilidades.includes(h)}
                      variante="lilas"
                      aoClicar={() =>
                        setPadrao({
                          ...padrao,
                          habilidades: padrao.habilidades.includes(h)
                            ? padrao.habilidades.filter((x) => x !== h)
                            : [...padrao.habilidades, h],
                        })
                      }
                    >
                      {padrao.habilidades.includes(h) && <Check className="h-3 w-3" />}
                      {ROTULO_HABILIDADE[h]}
                    </Chip>
                  ))}
                </Campo>
                <label className="mt-4 block">
                  <span className="text-xs font-bold text-neutral-600">
                    Foco <span className="font-medium text-neutral-400">(opcional)</span>
                  </span>
                  <input
                    value={padrao.foco}
                    onChange={(e) => setPadrao({ ...padrao, foco: e.target.value })}
                    placeholder="ex.: past simple, phrasal verbs de viagem..."
                    className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-3xl bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-200 text-xs font-extrabold text-violet-800">
                  2
                </span>
                Arquivos do lote <span className="font-medium text-neutral-400">— {itens.length}</span>
              </h2>
              <span className="text-xs font-medium text-neutral-400">Clique em um arquivo para personalizar só ele</span>
            </div>

            <ul className="space-y-2">
              {itens.map((item) => {
                const config = resolverConfig(padrao, item.override)
                const proprio = ehPersonalizado(item)
                const Icone = item.tipo === 'pdf' ? FileText : ImageIcon
                return (
                  <li key={item.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPersonalizandoId(item.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setPersonalizandoId(item.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 transition ${
                        proprio ? 'bg-violet-50 ring-1 ring-violet-200' : 'bg-neutral-50 hover:bg-neutral-100'
                      }`}
                    >
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white ${
                          proprio ? 'text-violet-600' : 'text-neutral-500'
                        }`}
                      >
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-neutral-900">{item.nome}</span>
                        <span className="text-xs font-medium text-neutral-500">{tamanhoLegivel(item.tamanho)}</span>
                      </span>
                      <span className="hidden items-center gap-1.5 text-xs font-bold text-neutral-500 sm:flex">
                        <span className="rounded-full bg-white px-2.5 py-1">{config.nivel}</span>
                        <span className="rounded-full bg-white px-2.5 py-1">{config.quantidade} questões</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                          proprio ? 'bg-violet-200 text-violet-800' : 'bg-neutral-200/60 text-neutral-400'
                        }`}
                      >
                        {proprio ? 'Personalizado' : 'Padrão'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setItens((atual) => atual.filter((i) => i.id !== item.id))
                        }}
                        aria-label={`Remover ${item.nome}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-white hover:text-neutral-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <BarraAcao
            info={
              excedeLimite
                ? 'Lote acima do limite do seu plano'
                : `${itens.length} ${itens.length === 1 ? 'atividade será gerada' : 'atividades serão geradas'}${
                    restantes !== null ? ` · usa ${itens.length} das suas ${restantes} gerações` : ''
                  }`
            }
          >
            <button
              type="button"
              disabled={excedeLimite || processandoArquivos}
              onClick={() => gerarLote(itens)}
              className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-extrabold text-neutral-900 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" /> Gerar {itens.length} {itens.length === 1 ? 'atividade' : 'atividades'}
            </button>
          </BarraAcao>
        </>
      )}

      {fase === 'gerando' && (
        <div className="mt-5 rounded-3xl bg-white p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
            <h2 className="text-lg font-extrabold">Gerando {itens.length} atividades...</h2>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${Math.round(((prontas.length + comErro.length) / itens.length) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-neutral-500">
            {prontas.length} de {itens.length} prontas
            {comErro.length > 0 && ` · ${comErro.length} com erro`}
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-sm font-medium text-amber-800">
              Mantenha esta aba aberta até terminar — a geração roda daqui e nada foi salvo ainda.
            </p>
          </div>

          <ul className="mt-4 space-y-1.5">
            {itens.map((item) => (
              <LinhaProgresso key={item.id} item={item} />
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => {
                cancelado.current = true
              }}
              className="rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-bold text-neutral-600"
            >
              Cancelar os que faltam
            </button>
          </div>
        </div>
      )}

      {fase === 'revisao' && (
        <>
          {erroSalvar && (
            <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erroSalvar}</p>
          )}

          {prontas.length > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
              <Caixa marcada={selecionadas.length === prontas.length} />
              <span className="text-sm font-bold text-neutral-800">
                {selecionadas.length} de {prontas.length} selecionadas
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => {
                  const marcarTodas = selecionadas.length < prontas.length
                  setItens((atual) => atual.map((i) => (i.estado === 'pronta' ? { ...i, selecionada: marcarTodas } : i)))
                }}
                className="text-xs font-bold text-neutral-500 hover:text-neutral-800"
              >
                {selecionadas.length === prontas.length ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {itens.map((item) =>
              item.estado === 'erro' ? (
                <li key={item.id} className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-neutral-900">{item.nome}</span>
                    <span className="text-xs font-bold text-rose-700">{item.erro}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => gerarUm(item)}
                    className="rounded-full bg-rose-100 px-4 py-2 text-xs font-bold text-rose-800"
                  >
                    Tentar de novo
                  </button>
                  <button
                    type="button"
                    onClick={() => setItens((atual) => atual.filter((i) => i.id !== item.id))}
                    aria-label={`Descartar ${item.nome}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ) : item.estado === 'pronta' && item.gerada ? (
                <CardRevisao
                  key={item.id}
                  item={item}
                  expandido={expandidoId === item.id}
                  aoExpandir={() => setExpandidoId(expandidoId === item.id ? null : item.id)}
                  aoAlternar={() => atualizarItem(item.id, { selecionada: !item.selecionada })}
                  aoEditar={() => setEditandoId(item.id)}
                />
              ) : (
                <li key={item.id} className="flex items-center gap-3 rounded-3xl bg-white/60 p-4">
                  <Circle className="h-4 w-4 shrink-0 text-neutral-300" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-400">
                    {item.nome} — geração cancelada
                  </span>
                  <button
                    type="button"
                    onClick={() => gerarUm(item)}
                    className="rounded-full bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-600"
                  >
                    Gerar agora
                  </button>
                </li>
              ),
            )}
          </ul>

          <BarraAcao
            info={
              comErro.length > 0
                ? `${comErro.length} ${comErro.length === 1 ? 'arquivo falhou' : 'arquivos falharam'} — revise acima`
                : 'Salvas como rascunho na sua biblioteca'
            }
          >
            <button
              type="button"
              disabled={selecionadas.length === 0 || salvando}
              onClick={salvarSelecionadas}
              className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-extrabold text-neutral-900 disabled:opacity-40"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar {selecionadas.length} como rascunho
            </button>
          </BarraAcao>
        </>
      )}

      {personalizando && (
        <PersonalizarItemLoteModal
          item={personalizando}
          posicao={itens.findIndex((i) => i.id === personalizando.id) + 1}
          total={itens.length}
          padrao={padrao}
          aoMudarOverride={(override) => atualizarItem(personalizando.id, { override })}
          aoFechar={() => setPersonalizandoId(null)}
          aoProximo={
            itens.findIndex((i) => i.id === personalizando.id) < itens.length - 1
              ? () => setPersonalizandoId(itens[itens.findIndex((i) => i.id === personalizando.id) + 1].id)
              : undefined
          }
        />
      )}
    </div>
  )
}

function LinhaProgresso({ item }: { item: ItemLote }) {
  const visual = {
    pronta: { fundo: 'bg-emerald-50', Icone: CheckCircle2, cor: 'text-emerald-600', texto: 'text-emerald-700' },
    erro: { fundo: 'bg-rose-50', Icone: AlertCircle, cor: 'text-rose-600', texto: 'text-rose-700' },
    gerando: { fundo: 'bg-violet-50', Icone: Loader2, cor: 'text-violet-600 animate-spin', texto: 'text-violet-700' },
    na_fila: { fundo: 'bg-neutral-50', Icone: Circle, cor: 'text-neutral-300', texto: 'text-neutral-400' },
  }[item.estado]

  const legenda =
    item.estado === 'pronta'
      ? `${item.gerada?.questoes.length ?? 0} questões`
      : item.estado === 'erro'
        ? item.erro
        : item.estado === 'gerando'
          ? 'gerando...'
          : 'na fila'

  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${visual.fundo}`}>
      <visual.Icone className={`h-4 w-4 shrink-0 ${visual.cor}`} />
      <span
        className={`min-w-0 flex-1 truncate text-sm font-bold ${
          item.estado === 'na_fila' ? 'text-neutral-400' : 'text-neutral-800'
        }`}
      >
        {item.nome}
      </span>
      <span className={`shrink-0 truncate text-xs font-bold ${visual.texto}`}>{legenda}</span>
    </li>
  )
}

function CardRevisao({
  item,
  expandido,
  aoExpandir,
  aoAlternar,
  aoEditar,
}: {
  item: ItemLote
  expandido: boolean
  aoExpandir: () => void
  aoAlternar: () => void
  aoEditar: () => void
}) {
  const gerada = item.gerada!
  return (
    <li className={`rounded-3xl p-4 ${item.selecionada ? 'bg-white' : 'bg-white/60'} ${expandido ? 'ring-2 ring-neutral-900' : gerada.descartadas > 0 ? 'ring-1 ring-amber-200' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={aoAlternar} aria-label={`Selecionar ${gerada.titulo}`}>
          <Caixa marcada={item.selecionada} />
        </button>
        <span className={`min-w-0 flex-1 ${item.selecionada ? '' : 'opacity-50'}`}>
          <span className="block truncate text-sm font-extrabold text-neutral-900">{gerada.titulo}</span>
          {gerada.descartadas > 0 ? (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              {gerada.descartadas} questão(ões) descartada(s) — saiu com {gerada.questoes.length}
            </span>
          ) : (
            <span className="block truncate text-xs font-medium text-neutral-500">
              de {item.nome} · {gerada.nivel} · {gerada.questoes.length} questões
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={aoExpandir}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${
            expandido ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {expandido ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {expandido ? 'Fechar' : 'Ver questões'}
        </button>
        <button
          type="button"
          onClick={aoEditar}
          className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-600"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>

      {expandido && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          {gerada.questoes.map((q, i) => (
            <div key={i} className="rounded-2xl bg-neutral-50 px-4 py-3">
              <p className="text-sm font-bold text-neutral-800">
                {i + 1}. {q.enunciado}
              </p>
              <PreviaResposta questao={q} />
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

/**
 * Prévia da resposta na revisão do lote. Precisa cobrir os OITO tipos do
 * contrato, não só múltipla escolha: sem isso, lacuna e ligar_colunas apareciam
 * como enunciado solto e o professor aprovava no escuro justamente as questões
 * em que a IA mais erra. Não é o editor — é o suficiente para decidir entre
 * aprovar e abrir o editor completo.
 */
function PreviaResposta({ questao }: { questao: Questao }) {
  if (questao.pares.length > 0) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
        {questao.pares.map((par) => (
          <span key={par.esquerda} className="rounded-full bg-white px-3 py-1 text-neutral-600">
            {par.esquerda} <span className="text-neutral-300">→</span>{' '}
            <span className="text-emerald-700">{par.direita}</span>
          </span>
        ))}
      </div>
    )
  }

  // Em ordenar_*, as opções são as fichas embaralhadas — a resposta é a frase
  // montada, então os chips sozinhos não diriam qual é a ordem certa.
  const chipMarcaResposta = questao.tipo === 'multipla_escolha' || questao.tipo === 'verdadeiro_falso'

  return (
    <>
      {questao.opcoes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
          {questao.opcoes.map((opcao, i) => (
            <span
              key={`${opcao}-${i}`}
              className={`rounded-full px-3 py-1 ${
                chipMarcaResposta && opcao === questao.resposta_correta
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-white text-neutral-500'
              }`}
            >
              {opcao}
              {chipMarcaResposta && opcao === questao.resposta_correta && ' ✓'}
            </span>
          ))}
        </div>
      )}
      {!chipMarcaResposta && questao.resposta_correta && (
        <p className="mt-2 text-xs font-bold text-emerald-800">
          <span className="font-medium text-neutral-500">
            {questao.tipo === 'pronuncia' ? 'Frase a ler: ' : 'Resposta: '}
          </span>
          {questao.resposta_correta}
          {questao.respostas_aceitas.length > 0 && (
            <span className="font-medium text-neutral-400">
              {' '}
              (também aceita: {questao.respostas_aceitas.join(', ')})
            </span>
          )}
        </p>
      )}
    </>
  )
}

function Caixa({ marcada }: { marcada: boolean }) {
  return marcada ? (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-neutral-900 text-white">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="block h-5 w-5 shrink-0 rounded-md border-2 border-neutral-300" />
  )
}

/** Barra de ação grudada no rodapé: o lote é longo e o botão não pode sumir. */
function BarraAcao({ info, children }: { info: string; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-full bg-neutral-900 px-6 py-3.5 text-white shadow-xl">
        <span className="text-xs font-bold text-neutral-300">{info}</span>
        {children}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <span className="text-xs font-bold text-neutral-600">{rotulo}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, FileText, Image as ImageIcon, Loader2, Pencil, Sparkles, Upload, X } from 'lucide-react'
import { useGerarAtividadeIA, type AtividadeGeradaIA, type MaterialGeracaoIA } from './api-ia'
import { useCriarAtividade, type MaterialParaSalvar } from './api'
import { AtividadeForm } from './AtividadeForm'
import { Chip } from '@/components/Chip'
import { imagemParaMaterial, pdfParaMaterial } from '@/lib/arquivo'
import { useUsoDoMes } from '@/features/planos/api'
import { NIVEIS, HABILIDADES, ROTULO_HABILIDADE } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

const TAMANHO_MAX_IMAGEM = 8 * 1024 * 1024
const TAMANHO_MAX_PDF = 15 * 1024 * 1024
const QUANTIDADES = [5, 10, 15, 20]

type ArquivoCarregado = {
  tipo: 'imagem' | 'pdf'
  conteudo: string
  mimeType: string
  nome: string
  tamanho: number
}

function tamanhoLegivel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * P4→P5→P6 do fluxo (FLUXOS.md): material colado + parâmetros → "gerando"
 * (até 90s) → revisão. A revisão reaproveita o mesmo AtividadeForm da criação
 * manual — nada vai ao aluno sem o professor revisar/editar antes de salvar
 * (RF-67/70); salvar aqui só cria um rascunho, igual a qualquer atividade.
 */
export function GerarAtividadePage() {
  const navigate = useNavigate()
  const gerar = useGerarAtividadeIA()
  const criar = useCriarAtividade()
  const { data: uso } = useUsoDoMes()
  const noLimite = uso !== undefined && uso.geracoesDoMes >= uso.limiteGeracoes
  const pertoDoLimite = uso !== undefined && !noLimite && uso.geracoesDoMes >= uso.limiteGeracoes * 0.8
  const [gerado, setGerado] = useState<AtividadeGeradaIA | null>(null)
  const [materialUsado, setMaterialUsado] = useState<MaterialParaSalvar | null>(null)

  const [modo, setModo] = useState<'texto' | 'arquivo'>('texto')
  const [material, setMaterial] = useState('')
  const [arquivo, setArquivo] = useState<ArquivoCarregado | null>(null)
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  const [nivel, setNivel] = useState<NivelCefr>('B1')
  const [quantidade, setQuantidade] = useState(10)
  const [habilidades, setHabilidades] = useState<string[]>([])
  const [foco, setFoco] = useState('')

  function alternarHabilidade(h: string) {
    setHabilidades((atual) => (atual.includes(h) ? atual.filter((x) => x !== h) : [...atual, h]))
  }

  async function aoEscolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivoEscolhido = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivoEscolhido) return

    setErroArquivo(null)
    setArquivo(null)

    const ehPdf = arquivoEscolhido.type === 'application/pdf'
    const ehImagem = arquivoEscolhido.type.startsWith('image/')
    if (!ehPdf && !ehImagem) {
      return setErroArquivo('Envie um PDF ou uma foto (JPG/PNG).')
    }
    if (ehPdf && arquivoEscolhido.size > TAMANHO_MAX_PDF) {
      return setErroArquivo('PDF muito grande — envie um arquivo de até 15MB.')
    }
    if (ehImagem && arquivoEscolhido.size > TAMANHO_MAX_IMAGEM * 4) {
      // ainda vai ser reduzida no canvas — só barra algo absurdo antes de processar
      return setErroArquivo('Imagem muito grande.')
    }

    setProcessandoArquivo(true)
    try {
      const material = ehPdf ? await pdfParaMaterial(arquivoEscolhido) : await imagemParaMaterial(arquivoEscolhido)
      setArquivo({
        tipo: ehPdf ? 'pdf' : 'imagem',
        ...material,
        nome: arquivoEscolhido.name,
        tamanho: arquivoEscolhido.size,
      })
    } catch (e) {
      setErroArquivo(e instanceof Error ? e.message : 'Não consegui processar este arquivo.')
    } finally {
      setProcessandoArquivo(false)
    }
  }

  async function aoGerar(evento: React.FormEvent) {
    evento.preventDefault()
    const materialParaEnviar: MaterialGeracaoIA =
      modo === 'texto'
        ? { tipo: 'texto', conteudo: material }
        : { tipo: arquivo!.tipo, conteudo: arquivo!.conteudo, mimeType: arquivo!.mimeType }
    const materialParaSalvar: MaterialParaSalvar =
      modo === 'texto'
        ? { tipo: 'texto', conteudo: material }
        : { tipo: arquivo!.tipo, conteudo: arquivo!.conteudo, mimeType: arquivo!.mimeType, nome: arquivo!.nome }

    const resultado = await gerar.mutateAsync({ material: materialParaEnviar, nivel, quantidade, habilidades, foco })
    setMaterialUsado(materialParaSalvar)
    setGerado(resultado)
  }

  const podeGerar =
    !gerar.isPending &&
    !processandoArquivo &&
    !noLimite &&
    (modo === 'texto' ? material.trim().length >= 20 : Boolean(arquivo))

  if (gerado) {
    return (
      <div>
        {gerado.descartadas > 0 && (
          <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {gerado.descartadas} questão(ões) vieram com algum problema e foram descartadas — reveja o que
            sobrou antes de salvar.
          </p>
        )}
        <AtividadeForm
          tituloPagina="Revisar atividade gerada"
          rotuloBotao="Salvar atividade"
          valoresIniciais={{
            titulo: gerado.titulo,
            nivel: gerado.nivel,
            habilidades: gerado.habilidades,
            questoes: gerado.questoes,
          }}
          aoSalvar={async (dados) => {
            const atividade = await criar.mutateAsync({ ...dados, origemIA: true, material: materialUsado ?? undefined })
            navigate(`/atividades/${atividade.id}`)
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <Sparkles className="h-4 w-4" />
        </span>
        <h1 className="text-2xl font-extrabold">Gerar atividade com IA</h1>
      </div>
      <p className="mt-1.5 text-sm text-neutral-500">
        Cole o texto ou envie um PDF/foto do material da aula — a IA usa só o que está aí, nunca inventa
        conteúdo novo.
      </p>

      {uso && (noLimite || pertoDoLimite) && (
        <p
          className={`mt-3 rounded-2xl px-4 py-3 text-sm font-medium ${
            noLimite ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {noLimite
            ? `Você atingiu o limite de ${uso.limiteGeracoes} gerações por IA ${uso.plano === 'pro' ? 'este mês' : 'do plano gratuito este mês'}.`
            : `${uso.geracoesDoMes}/${uso.limiteGeracoes} gerações usadas este mês — você está perto do limite.`}
        </p>
      )}

      <form onSubmit={aoGerar} className="mt-5 space-y-4">
        {gerar.isError && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {(gerar.error as Error).message}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao numero={1} cor="bg-violet-200 text-violet-800" titulo="Material da aula">
            <div className="flex gap-1.5 rounded-full bg-neutral-100 p-1">
              <AbaMaterial
                ativa={modo === 'texto'}
                aoClicar={() => setModo('texto')}
                desabilitada={gerar.isPending}
                Icone={Pencil}
                rotulo="Colar texto"
              />
              <AbaMaterial
                ativa={modo === 'arquivo'}
                aoClicar={() => setModo('arquivo')}
                desabilitada={gerar.isPending}
                Icone={Upload}
                rotulo="PDF ou foto"
              />
            </div>

            {modo === 'texto' ? (
              <textarea
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                rows={12}
                placeholder="Cole aqui o texto, diálogo ou lista de vocabulário usado na aula..."
                className="mt-4 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2"
                disabled={gerar.isPending}
              />
            ) : (
              <div className="mt-4">
                {erroArquivo && (
                  <p className="mb-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
                    {erroArquivo}
                  </p>
                )}

                {arquivo ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700">
                      {arquivo.tipo === 'pdf' ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-neutral-900">{arquivo.nome}</span>
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Check className="h-3 w-3" />
                        {tamanhoLegivel(arquivo.tamanho)} ·{' '}
                        {arquivo.tipo === 'pdf' ? 'pronto para a IA ler' : 'foto reduzida para envio'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setArquivo(null)}
                      disabled={gerar.isPending}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-emerald-700/60 hover:bg-white hover:text-emerald-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-12 text-center transition hover:border-neutral-400">
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={aoEscolherArquivo}
                      disabled={gerar.isPending || processandoArquivo}
                      className="hidden"
                    />
                    {processandoArquivo ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                        <span className="text-sm font-bold text-neutral-500">Processando arquivo...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-neutral-400" />
                        <span className="text-sm font-bold text-neutral-600">
                          Clique para escolher um PDF ou foto
                        </span>
                        <span className="text-xs text-neutral-400">até 15MB (PDF) ou 32MB (foto)</span>
                      </>
                    )}
                  </label>
                )}
              </div>
            )}
          </Cartao>

          <Cartao numero={2} cor="bg-emerald-200 text-emerald-800" titulo="Parâmetros">
            <Campo rotulo="Nível">
              {NIVEIS.map((n) => (
                <Chip key={n} ativo={nivel === n} aoClicar={() => setNivel(n)} desabilitado={gerar.isPending}>
                  {n}
                </Chip>
              ))}
            </Campo>

            <Campo rotulo="Questões">
              {QUANTIDADES.map((q) => (
                <Chip
                  key={q}
                  ativo={quantidade === q}
                  aoClicar={() => setQuantidade(q)}
                  desabilitado={gerar.isPending}
                >
                  {q}
                </Chip>
              ))}
            </Campo>

            <Campo rotulo="Habilidades">
              {HABILIDADES.map((h) => (
                <Chip
                  key={h}
                  ativo={habilidades.includes(h)}
                  variante="lilas"
                  aoClicar={() => alternarHabilidade(h)}
                  desabilitado={gerar.isPending}
                >
                  {habilidades.includes(h) && <Check className="h-3 w-3" />}
                  {ROTULO_HABILIDADE[h]}
                </Chip>
              ))}
            </Campo>

            <label className="mt-4 block">
              <span className="text-xs font-bold text-neutral-600">
                Foco <span className="font-medium text-neutral-400">(opcional)</span>
              </span>
              <input
                value={foco}
                onChange={(e) => setFoco(e.target.value)}
                placeholder="ex.: past simple, phrasal verbs de viagem..."
                disabled={gerar.isPending}
                className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2"
              />
            </label>
          </Cartao>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!podeGerar}
            className="flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-extrabold text-white transition disabled:opacity-40"
          >
            {gerar.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando... pode levar até 90 segundos
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Gerar atividade
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Cartão de etapa, com a bolinha numerada do mockup. */
function Cartao({
  numero,
  cor,
  titulo,
  children,
}: {
  numero: number
  cor: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-3xl bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-neutral-900">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${cor}`}>
          {numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function AbaMaterial({
  ativa,
  aoClicar,
  desabilitada,
  Icone,
  rotulo,
}: {
  ativa: boolean
  aoClicar: () => void
  desabilitada: boolean
  Icone: typeof Upload
  rotulo: string
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitada}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition ${
        ativa ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
      }`}
    >
      <Icone className="h-3.5 w-3.5" /> {rotulo}
    </button>
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


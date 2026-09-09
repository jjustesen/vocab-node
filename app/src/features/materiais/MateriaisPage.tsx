import { useMemo, useState } from 'react'
import {
  Check,
  Download,
  Folder,
  FolderPlus,
  Inbox,
  Loader2,
  Pencil,
  Search,
  Type,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import type { Material, MaterialTipo, PastaMaterial } from '@/types/db'
import { BotaoApagar } from '@/components/BotaoApagar'
import { SoltarArquivos } from './SoltarArquivos'
import { EscolherAlunos } from './EscolherAlunos'
import { VISUAL_TIPO } from './visual'
import {
  SEM_PASTA,
  urlAssinada,
  useAcervo,
  useCriarPasta,
  useDonosDosMateriais,
  useExcluirMaterial,
  useExcluirPasta,
  useMoverParaPasta,
  usePastas,
  useRenomearPasta,
  useSubirAoAcervo,
} from './api'

/**
 * O acervo do professor — tudo o que ele tem, dado a alguém ou não.
 *
 * Existe porque 0016 separou o arquivo de quem tem acesso a ele. Antes desta
 * tela, um material só nascia dentro da ficha de um aluno: para reaproveitar
 * a mesma apostila com outra pessoa, o professor subia o arquivo de novo.
 *
 * Aqui o material entra uma vez e depois é distribuído — na ficha do aluno,
 * na sala, ou por esta própria tela.
 *
 * A lista inclui os materiais que nasceram de uma geração de atividade (eles
 * sempre tiveram `aluno_id` nulo, mesmo antes de 0016). São do professor tanto
 * quanto os outros; escondê-los seria fingir que o acervo é menor do que é.
 *
 * ── As pastas (0017) ────────────────────────────────────────────────────────
 *
 * Prateleiras: "Livro 1", "Provas". Elas filtram e agrupam, e não escondem
 * nada — "Todas" continua sendo a visão padrão, porque a busca por nome só
 * funciona se ela varrer o acervo inteiro. Pasta aqui é organização, nunca
 * permissão: quem tem cada material continua sendo assunto de
 * `materiais_alunos` (ver o cabeçalho de 0017).
 */
const FILTROS: (MaterialTipo | 'todos')[] = ['todos', 'pdf', 'imagem', 'audio', 'docx', 'texto']

/** Qual prateleira está aberta. `'todas'` é a visão do acervo inteiro. */
type PastaAberta = 'todas' | typeof SEM_PASTA | string

export function MateriaisPage() {
  const { data: acervo, isLoading } = useAcervo()
  const { data: pastas } = usePastas()
  const { data: alunos } = useAlunos('ativo')

  const [pastaAberta, setPastaAberta] = useState<PastaAberta>('todas')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<MaterialTipo | 'todos'>('todos')
  const [distribuindo, setDistribuindo] = useState<Material | null>(null)

  /**
   * O arquivo novo cai NA PASTA ABERTA. Quem arrasta um PDF para dentro de
   * "Livro 1" já disse onde ele vai; pedir para mover depois seria perguntar
   * duas vezes a mesma coisa. Em "Todas" e em "Sem pasta" ele nasce na raiz.
   */
  const pastaDoUpload = pastaAberta === 'todas' || pastaAberta === SEM_PASTA ? null : pastaAberta
  const subir = useSubirAoAcervo(pastaDoUpload)

  const ids = useMemo(() => (acervo ?? []).map((m) => m.id), [acervo])
  const { data: donos } = useDonosDosMateriais(ids)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (acervo ?? [])
      .filter((m) =>
        pastaAberta === 'todas'
          ? true
          : pastaAberta === SEM_PASTA
            ? m.pasta_id === null
            : m.pasta_id === pastaAberta,
      )
      .filter((m) => tipo === 'todos' || m.tipo === tipo)
      .filter((m) => !termo || m.nome.toLowerCase().includes(termo))
  }, [acervo, busca, tipo, pastaAberta])

  /** Quantos itens em cada prateleira — o número é metade da utilidade da aba. */
  const contagem = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const m of acervo ?? []) {
      const chave = m.pasta_id ?? SEM_PASTA
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
    }
    return mapa
  }, [acervo])

  const nomePorAluno = useMemo(
    () => new Map((alunos ?? []).map((a) => [a.id, a.nome])),
    [alunos],
  )

  const pastaCorrente = (pastas ?? []).find((p) => p.id === pastaAberta) ?? null

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-neutral-900">
          Materiais {acervo ? <span className="text-neutral-400">· {acervo.length}</span> : null}
        </h1>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Seu acervo. O arquivo entra aqui uma vez e depois vai para quem você quiser — na ficha do
        aluno, na sala ou por aqui mesmo.
      </p>

      <BarraDePastas
        pastas={pastas ?? []}
        aberta={pastaAberta}
        contagem={contagem}
        total={acervo?.length ?? 0}
        aoAbrir={setPastaAberta}
        pastaCorrente={pastaCorrente}
        aoSairDaPasta={() => setPastaAberta('todas')}
      />

      <div className="mt-4">
        <SoltarArquivos
          aoReceber={(arquivo) => subir.mutateAsync({ tipo: 'arquivo', arquivo })}
          rotulo={
            pastaCorrente
              ? `Arraste arquivos aqui para "${pastaCorrente.nome}"`
              : 'Arraste arquivos aqui para o seu acervo'
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-white px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setTipo(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                tipo === f ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {f === 'todos' ? 'Todos' : VISUAL_TIPO[f].rotulo}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {acervo && acervo.length === 0 && (
        <div className="mt-6 rounded-3xl bg-white p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
            <Upload className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-bold text-neutral-900">Acervo vazio</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
            Suba aqui o que você já usa nas aulas. Depois é só escolher da lista quando for
            disponibilizar para um aluno ou para a turma inteira.
          </p>
        </div>
      )}

      {acervo && acervo.length > 0 && filtrados.length === 0 && (
        <p className="mt-6 rounded-2xl bg-white px-4 py-4 text-center text-xs text-neutral-500">
          {pastaCorrente
            ? `Nada em "${pastaCorrente.nome}" com esse filtro.`
            : 'Nenhum material para esse filtro.'}
        </p>
      )}

      {filtrados.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {filtrados.map((material) => (
            <LinhaDoAcervo
              key={material.id}
              material={material}
              pastas={pastas ?? []}
              mostrarPasta={pastaAberta === 'todas'}
              donos={donos?.get(material.id) ?? []}
              nomePorAluno={nomePorAluno}
              aoDistribuir={() => setDistribuindo(material)}
            />
          ))}
        </ul>
      )}

      {distribuindo && (
        <EscolherAlunos
          material={distribuindo}
          jaTem={donos?.get(distribuindo.id) ?? []}
          aoFechar={() => setDistribuindo(null)}
        />
      )}
    </div>
  )
}

/**
 * As prateleiras, e o que se faz com elas.
 *
 * "Todas" primeiro e sempre presente: o acervo inteiro é a visão de trabalho,
 * e a pasta é um recorte dela. "Sem pasta" só aparece quando existe algo lá —
 * numa organização completa a aba seria uma prateleira vazia permanente.
 */
function BarraDePastas({
  pastas,
  aberta,
  contagem,
  total,
  aoAbrir,
  pastaCorrente,
  aoSairDaPasta,
}: {
  pastas: PastaMaterial[]
  aberta: PastaAberta
  contagem: Map<string, number>
  total: number
  aoAbrir: (pasta: PastaAberta) => void
  pastaCorrente: PastaMaterial | null
  aoSairDaPasta: () => void
}) {
  const criar = useCriarPasta()
  const renomear = useRenomearPasta()
  const excluir = useExcluirPasta()

  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState(false)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const semPasta = contagem.get(SEM_PASTA) ?? 0

  function confirmarCriacao(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    criar.mutate(nome, {
      onSuccess: (pasta) => {
        setNome('')
        setCriando(false)
        // Abre a pasta recém-criada: quem acabou de criar "Livro 1" quer
        // colocar coisas nele, e o passo seguinte é sempre esse.
        aoAbrir(pasta.id)
      },
      onError: (e) => setErro(e.message),
    })
  }

  function confirmarRenomeacao(evento: React.FormEvent) {
    evento.preventDefault()
    if (!pastaCorrente) return
    setErro(null)
    renomear.mutate(
      { id: pastaCorrente.id, nome },
      { onSuccess: () => setRenomeando(false), onError: (e) => setErro(e.message) },
    )
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Aba
          rotulo="Todas"
          contagem={total}
          ativa={aberta === 'todas'}
          aoClicar={() => aoAbrir('todas')}
        />

        {pastas.map((pasta) => (
          <Aba
            key={pasta.id}
            Icone={Folder}
            rotulo={pasta.nome}
            contagem={contagem.get(pasta.id) ?? 0}
            ativa={aberta === pasta.id}
            aoClicar={() => aoAbrir(pasta.id)}
          />
        ))}

        {semPasta > 0 && (
          <Aba
            Icone={Inbox}
            rotulo="Sem pasta"
            contagem={semPasta}
            ativa={aberta === SEM_PASTA}
            aoClicar={() => aoAbrir(SEM_PASTA)}
          />
        )}

        {!criando && (
          <button
            onClick={() => {
              setNome('')
              setErro(null)
              setCriando(true)
            }}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Nova pasta
          </button>
        )}

        {criando && (
          <CampoDePasta
            valor={nome}
            aoDigitar={setNome}
            aoEnviar={confirmarCriacao}
            aoCancelar={() => setCriando(false)}
            pendente={criar.isPending}
            marcador="Livro 1"
          />
        )}
      </div>

      {/*
        As ações da pasta ficam AQUI, e não em cada aba: um lápis e uma lixeira
        por prateleira encheriam a barra de alvos pequenos e perigosos. Renomear
        e apagar são coisas que se faz de dentro da pasta aberta, que é onde a
        pessoa já está vendo o que há nela.
      */}
      {pastaCorrente && !renomeando && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-neutral-500">Pasta "{pastaCorrente.nome}":</span>
          <button
            onClick={() => {
              setNome(pastaCorrente.nome)
              setErro(null)
              setRenomeando(true)
            }}
            className="flex items-center gap-1 rounded-full px-2 py-1 font-bold text-neutral-500 hover:bg-white hover:text-neutral-900"
          >
            <Pencil className="h-3 w-3" /> Renomear
          </button>
          {/*
            Apagar a pasta NÃO apaga material: o `set null` de 0017 devolve tudo
            à raiz. A confirmação diz isso com todas as letras, senão o botão
            parece o mesmo perigo do "apagar do acervo" logo abaixo — e o
            professor deixa de arrumar as coisas com medo de perder arquivo.
          */}
          <BotaoApagar
            titulo="Apagar a pasta"
            confirmacao={
              (contagem.get(pastaCorrente.id) ?? 0) > 0
                ? `Apagar a pasta? Os ${contagem.get(pastaCorrente.id)} materiais voltam para "Sem pasta"`
                : 'Apagar a pasta?'
            }
            pendente={excluir.isPending}
            aoConfirmar={() => excluir.mutate(pastaCorrente.id, { onSuccess: aoSairDaPasta })}
          />
        </div>
      )}

      {pastaCorrente && renomeando && (
        <div className="mt-2">
          <CampoDePasta
            valor={nome}
            aoDigitar={setNome}
            aoEnviar={confirmarRenomeacao}
            aoCancelar={() => setRenomeando(false)}
            pendente={renomear.isPending}
            marcador={pastaCorrente.nome}
          />
        </div>
      )}

      {erro && <p className="mt-2 text-xs font-medium text-rose-700">{erro}</p>}
    </div>
  )
}

function Aba({
  Icone,
  rotulo,
  contagem,
  ativa,
  aoClicar,
}: {
  Icone?: typeof Folder
  rotulo: string
  contagem: number
  ativa: boolean
  aoClicar: () => void
}) {
  return (
    <button
      onClick={aoClicar}
      className={`flex max-w-56 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
        ativa ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {Icone && <Icone className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{rotulo}</span>
      <span className={ativa ? 'text-neutral-400' : 'text-neutral-300'}>{contagem}</span>
    </button>
  )
}

function CampoDePasta({
  valor,
  aoDigitar,
  aoEnviar,
  aoCancelar,
  pendente,
  marcador,
}: {
  valor: string
  aoDigitar: (v: string) => void
  aoEnviar: (e: React.FormEvent) => void
  aoCancelar: () => void
  pendente: boolean
  marcador: string
}) {
  return (
    <form onSubmit={aoEnviar} className="flex items-center gap-1 rounded-full bg-white px-2 py-1">
      <input
        autoFocus
        value={valor}
        onChange={(e) => aoDigitar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') aoCancelar()
        }}
        placeholder={marcador}
        maxLength={60}
        className="w-32 bg-transparent px-2 text-xs font-bold outline-none placeholder:font-normal placeholder:text-neutral-400"
      />
      <button
        type="submit"
        disabled={pendente || valor.trim().length === 0}
        title="Confirmar"
        className="grid h-6 w-6 place-items-center rounded-full bg-neutral-900 text-white disabled:opacity-30"
      >
        {pendente ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={aoCancelar}
        title="Cancelar"
        className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
      >
        <X className="h-3 w-3" />
      </button>
    </form>
  )
}

function LinhaDoAcervo({
  material,
  pastas,
  mostrarPasta,
  donos,
  nomePorAluno,
  aoDistribuir,
}: {
  material: Material
  pastas: PastaMaterial[]
  /** Em "Todas", a pasta de cada item precisa aparecer; dentro dela, seria repetir o cabeçalho. */
  mostrarPasta: boolean
  donos: string[]
  nomePorAluno: Map<string, string>
  aoDistribuir: () => void
}) {
  const excluir = useExcluirMaterial()
  const mover = useMoverParaPasta()
  const [baixando, setBaixando] = useState(false)
  const [texto, setTexto] = useState(false)
  const { Icone, cor } = VISUAL_TIPO[material.tipo]

  async function baixar() {
    if (!material.storage_path) return
    setBaixando(true)
    try {
      window.open(await urlAssinada(material.storage_path), '_blank')
    } finally {
      setBaixando(false)
    }
  }

  const nomes = donos.map((id) => nomePorAluno.get(id)).filter(Boolean) as string[]
  const pastaDoItem = pastas.find((p) => p.id === material.pasta_id) ?? null

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${cor}`}>
        <Icone className="h-5 w-5" />
      </span>

      <span className="min-w-40 flex-1">
        <span className="block truncate text-sm font-bold text-neutral-900">{material.nome}</span>
        {/*
          "Quem já tem" é a informação que o acervo existe para dar. Sem ela, a
          lista seria só uma pasta — e o professor não teria como saber se
          precisa distribuir de novo.
        */}
        <span className="block truncate text-xs text-neutral-500" title={nomes.join(', ')}>
          {mostrarPasta && pastaDoItem && (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-1.5 py-0.5 font-bold text-neutral-600">
              <Folder className="h-2.5 w-2.5" />
              {pastaDoItem.nome}
            </span>
          )}
          {donos.length === 0
            ? 'ainda não está com ninguém'
            : donos.length <= 2
              ? `com ${nomes.join(' e ')}`
              : `com ${nomes.slice(0, 2).join(', ')} e mais ${donos.length - 2}`}
        </span>
      </span>

      {/*
        `gap-2` e o separador antes dos ícones: são três grupos de risco muito
        diferente na mesma fileira — mover (reversível), disponibilizar (some
        no aluno) e apagar (some para todo mundo). Encostados, o dedo que mira
        o download acerta a lixeira.
      */}
      <span className="flex shrink-0 items-center gap-2">
        {/*
          `select` nativo, e não um menu desenhado: mover é um gesto raro e
          arrastar-e-soltar entre abas não existe no celular. O nativo já traz
          teclado, rolagem e busca por letra de graça.
        */}
        <select
          value={material.pasta_id ?? ''}
          disabled={mover.isPending}
          onChange={(e) => mover.mutate({ materialIds: [material.id], pastaId: e.target.value || null })}
          title="Mover para uma pasta"
          className="max-w-32 rounded-full bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-600 outline-none"
        >
          <option value="">Sem pasta</option>
          {pastas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>

        <button
          onClick={aoDistribuir}
          title="Disponibilizar para alunos"
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-2 text-xs font-bold text-white"
        >
          <Users className="h-3.5 w-3.5" /> Disponibilizar
        </button>

        <span className="ml-1 h-6 w-px bg-neutral-200" />

        {material.tipo === 'texto' ? (
          <button
            onClick={() => setTexto((v) => !v)}
            title="Ver texto"
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            <Type className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={baixar}
            title="Baixar"
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        )}

        {/*
          Apagar aqui é do ACERVO: some para todo mundo que tinha, e o arquivo
          sai do bucket. É a diferença que 0016 criou, e a confirmação carrega
          quantas pessoas perdem o acesso — o número é o que faz a pessoa
          parar e pensar.
        */}
        <BotaoApagar
          titulo="Apagar do acervo"
          confirmacao={
            donos.length > 0
              ? `Apagar? ${donos.length} ${donos.length === 1 ? 'aluno perde' : 'alunos perdem'} o acesso`
              : 'Apagar do acervo?'
          }
          pendente={excluir.isPending}
          aoConfirmar={() => excluir.mutate(material)}
        />
      </span>

      {texto && material.texto && (
        <p className="w-full rounded-2xl bg-neutral-50 p-4 text-xs whitespace-pre-wrap text-neutral-700">
          {material.texto}
        </p>
      )}
    </li>
  )
}

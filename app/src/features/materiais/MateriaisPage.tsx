import { useMemo, useState } from 'react'
import { Download, Loader2, Search, Type, Upload, Users } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import type { Material, MaterialTipo } from '@/types/db'
import { BotaoApagar } from '@/components/BotaoApagar'
import { SoltarArquivos } from './SoltarArquivos'
import { EscolherAlunos } from './EscolherAlunos'
import { VISUAL_TIPO } from './visual'
import {
  urlAssinada,
  useAcervo,
  useDonosDosMateriais,
  useExcluirMaterial,
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
 */
const FILTROS: (MaterialTipo | 'todos')[] = ['todos', 'pdf', 'imagem', 'audio', 'docx', 'texto']

export function MateriaisPage() {
  const { data: acervo, isLoading } = useAcervo()
  const { data: alunos } = useAlunos('ativo')
  const subir = useSubirAoAcervo()

  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<MaterialTipo | 'todos'>('todos')
  const [distribuindo, setDistribuindo] = useState<Material | null>(null)

  const ids = useMemo(() => (acervo ?? []).map((m) => m.id), [acervo])
  const { data: donos } = useDonosDosMateriais(ids)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (acervo ?? [])
      .filter((m) => tipo === 'todos' || m.tipo === tipo)
      .filter((m) => !termo || m.nome.toLowerCase().includes(termo))
  }, [acervo, busca, tipo])

  const nomePorAluno = useMemo(
    () => new Map((alunos ?? []).map((a) => [a.id, a.nome])),
    [alunos],
  )

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

      <div className="mt-4">
        <SoltarArquivos
          aoReceber={(arquivo) => subir.mutateAsync({ tipo: 'arquivo', arquivo })}
          rotulo="Arraste arquivos aqui para o seu acervo"
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
          Nenhum material para esse filtro.
        </p>
      )}

      {filtrados.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {filtrados.map((material) => (
            <LinhaDoAcervo
              key={material.id}
              material={material}
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

function LinhaDoAcervo({
  material,
  donos,
  nomePorAluno,
  aoDistribuir,
}: {
  material: Material
  donos: string[]
  nomePorAluno: Map<string, string>
  aoDistribuir: () => void
}) {
  const excluir = useExcluirMaterial()
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
          {donos.length === 0
            ? 'ainda não está com ninguém'
            : donos.length <= 2
              ? `com ${nomes.join(' e ')}`
              : `com ${nomes.slice(0, 2).join(', ')} e mais ${donos.length - 2}`}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <button
          onClick={aoDistribuir}
          title="Disponibilizar para alunos"
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white"
        >
          <Users className="h-3.5 w-3.5" /> Disponibilizar
        </button>

        {material.tipo === 'texto' ? (
          <button
            onClick={() => setTexto((v) => !v)}
            title="Ver texto"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            <Type className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={baixar}
            title="Baixar"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
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

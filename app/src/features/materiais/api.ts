import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Material, MaterialTipo, PastaMaterial } from '@/types/db'

/**
 * Materiais — o acervo do professor, e quem tem acesso a cada peça.
 *
 * O modelo mudou em 0016: `materiais` é O ARQUIVO (do professor, existe uma
 * vez só) e `materiais_alunos` é QUEM TEM ACESSO. Antes disso o material
 * pertencia a um aluno, e compartilhar a mesma apostila com uma turma exigiria
 * subir o mesmo PDF uma vez por pessoa.
 *
 * A consequência prática que atravessa este arquivo: "dar um material a
 * alguém" e "subir um arquivo" viraram operações diferentes. Subir cria a
 * peça; dar cria o vínculo. Quase toda a tela nova é sobre a segunda.
 */

export const chavesMateriais = {
  acervo: ['materiais', 'acervo'] as const,
  doAluno: (alunoId: string) => ['materiais', 'aluno', alunoId] as const,
  deVarios: (alunoIds: string[]) => ['materiais', 'varios', [...alunoIds].sort().join(',')] as const,
  donos: (materialIds: string[]) => ['materiais', 'donos', [...materialIds].sort().join(',')] as const,
  pastas: ['materiais', 'pastas'] as const,
}

/** RF-50: teto por arquivo. */
export const TAMANHO_MAX_MATERIAL = 25 * 1024 * 1024

const TIPO_POR_MIME: { prefixo: string; tipo: MaterialTipo }[] = [
  { prefixo: 'application/pdf', tipo: 'pdf' },
  { prefixo: 'image/', tipo: 'imagem' },
  { prefixo: 'audio/', tipo: 'audio' },
  {
    prefixo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    tipo: 'docx',
  },
]

export function tipoDoArquivo(mime: string): MaterialTipo | null {
  return TIPO_POR_MIME.find((t) => mime.startsWith(t.prefixo))?.tipo ?? null
}

/**
 * Tudo o que o professor tem, tenha ou não dado a alguém.
 *
 * Inclui os materiais que nasceram de uma geração de atividade (`aluno_id` era
 * nulo já antes de 0016). Eles são do professor tanto quanto os outros — não
 * há motivo para escondê-los de quem quer reaproveitar um PDF.
 */
export function useAcervo() {
  return useQuery({
    queryKey: chavesMateriais.acervo,
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase
        .from('materiais')
        .select('*')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** RF-52: o que ESTE aluno tem. Ordenado por quando ele recebeu, não por quando o arquivo nasceu. */
export function useMateriaisDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesMateriais.doAluno(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<Material[]> => {
      const { data: vinculos, error } = await supabase
        .from('materiais_alunos')
        .select('material_id, criado_em')
        .eq('aluno_id', alunoId!)
        .order('criado_em', { ascending: false })
      if (error) throw error
      if (vinculos.length === 0) return []

      const { data: materiais, error: erroMateriais } = await supabase
        .from('materiais')
        .select('*')
        .in('id', vinculos.map((v) => v.material_id))
      if (erroMateriais) throw erroMateriais

      // Reordena pela data do VÍNCULO: `in` devolve na ordem do banco, e o que
      // interessa aqui é a ordem em que este aluno recebeu as coisas.
      const porId = new Map(materiais.map((m) => [m.id, m]))
      return vinculos.map((v) => porId.get(v.material_id)).filter((m): m is Material => Boolean(m))
    },
  })
}

export type MaterialComDonos = Material & { donos: string[] }

/**
 * A união dos materiais de VÁRIOS alunos, sem repetir, dizendo quem já tem
 * cada um.
 *
 * É o que a sala de turma precisa: cinco alunos, cinco fichas, e um único
 * material que talvez três deles já tenham. Concatenar as cinco listas
 * mostraria o mesmo PDF três vezes; o que o professor quer saber é "quem ainda
 * não recebeu isto".
 */
export function useMateriaisDeVarios(alunoIds: string[]) {
  const chave = chavesMateriais.deVarios(alunoIds)
  return useQuery({
    queryKey: chave,
    enabled: alunoIds.length > 0,
    queryFn: async (): Promise<MaterialComDonos[]> => {
      const { data: vinculos, error } = await supabase
        .from('materiais_alunos')
        .select('material_id, aluno_id, criado_em')
        .in('aluno_id', alunoIds)
      if (error) throw error
      if (vinculos.length === 0) return []

      const donosPorMaterial = new Map<string, string[]>()
      const recenciaPorMaterial = new Map<string, string>()
      for (const v of vinculos) {
        const donos = donosPorMaterial.get(v.material_id) ?? []
        donos.push(v.aluno_id)
        donosPorMaterial.set(v.material_id, donos)
        const atual = recenciaPorMaterial.get(v.material_id)
        if (!atual || v.criado_em > atual) recenciaPorMaterial.set(v.material_id, v.criado_em)
      }

      const { data: materiais, error: erroMateriais } = await supabase
        .from('materiais')
        .select('*')
        .in('id', [...donosPorMaterial.keys()])
      if (erroMateriais) throw erroMateriais

      return materiais
        .map((m) => ({ ...m, donos: donosPorMaterial.get(m.id) ?? [] }))
        .sort((a, b) => (recenciaPorMaterial.get(b.id) ?? '').localeCompare(recenciaPorMaterial.get(a.id) ?? ''))
    },
  })
}

/** Quem tem cada material desta lista — para a tela do acervo dizer "3 alunos". */
export function useDonosDosMateriais(materialIds: string[]) {
  return useQuery({
    queryKey: chavesMateriais.donos(materialIds),
    enabled: materialIds.length > 0,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await supabase
        .from('materiais_alunos')
        .select('material_id, aluno_id')
        .in('material_id', materialIds)
      if (error) throw error

      const mapa = new Map<string, string[]>()
      for (const v of data) mapa.set(v.material_id, [...(mapa.get(v.material_id) ?? []), v.aluno_id])
      return mapa
    },
  })
}

// ---------------------------------------------------------------------------
// Pastas (0017) — as prateleiras do acervo.
//
// Elas ORGANIZAM e não dão acesso a nada: quem tem cada material continua
// sendo assunto de `materiais_alunos`. É por isso que nada aqui embaixo toca
// em vínculo, e por isso mover um material entre pastas nunca muda quem o vê.
// ---------------------------------------------------------------------------

/** Marca da raiz do acervo — os materiais sem pasta. */
export const SEM_PASTA = 'sem-pasta'

export function usePastas() {
  return useQuery({
    queryKey: chavesMateriais.pastas,
    queryFn: async (): Promise<PastaMaterial[]> => {
      const { data, error } = await supabase
        .from('pastas_materiais')
        .select('*')
        // Por NOME, não por data: a prateleira é procurada com o olho, e
        // "Livro 1, Livro 2, Livro 3" só ajuda se estiver nessa ordem.
        .order('nome')
      if (error) throw error
      return data
    },
  })
}

/** Erro de nome repetido, traduzido — o índice único de 0017 vem como 23505. */
function traduzirErroDePasta(erro: { code?: string; message: string }): Error {
  if (erro.code === '23505') return new Error('Já existe uma pasta com esse nome.')
  return new Error(erro.message)
}

export function useCriarPasta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nome: string): Promise<PastaMaterial> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')
      const { data, error } = await supabase
        .from('pastas_materiais')
        .insert({ professor_id: sessao.user.id, nome: nome.trim() })
        .select('*')
        .single()
      if (error) throw traduzirErroDePasta(error)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

export function useRenomearPasta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase
        .from('pastas_materiais')
        .update({ nome: nome.trim() })
        .eq('id', id)
      if (error) throw traduzirErroDePasta(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/**
 * Apaga a PRATELEIRA, nunca os livros.
 *
 * O `on delete set null` de 0017 devolve os materiais à raiz do acervo, e quem
 * já os tinha continua com eles. Se apagar a pasta levasse os arquivos junto,
 * uma decisão de arrumação viraria perda de material para a turma inteira —
 * e o gesto não parece perigoso o bastante para carregar esse peso.
 */
export function useExcluirPasta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pastas_materiais').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/** Move materiais entre prateleiras. `pastaId` nulo devolve à raiz. */
export function useMoverParaPasta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ materialIds, pastaId }: { materialIds: string[]; pastaId: string | null }) => {
      const { error } = await supabase
        .from('materiais')
        .update({ pasta_id: pastaId })
        .in('id', materialIds)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/**
 * RNF-10: o bucket é privado, então o download sai por URL assinada e
 * temporária — nunca por URL pública. Uma hora é folga suficiente para abrir
 * o arquivo sem deixar o link circulando.
 */
export async function urlAssinada(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('materiais').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export type NovoMaterial =
  | { tipo: 'texto'; nome: string; texto: string }
  | { tipo: 'arquivo'; arquivo: File }

/**
 * Sobe o arquivo para o acervo e devolve o id. Não dá a ninguém — quem dá é
 * `useDisponibilizar`.
 *
 * `pastaId` é onde ele cai. Quando a tela está com uma pasta aberta, o arquivo
 * novo já nasce ali: o professor que arrasta um PDF para dentro de "Livro 1"
 * está dizendo onde ele vai, e obrigá-lo a mover depois seria pedir duas vezes
 * a mesma informação.
 */
async function subirParaOAcervo(entrada: NovoMaterial, pastaId: string | null = null): Promise<string> {
  const { data: sessao } = await supabase.auth.getUser()
  if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')
  const professorId = sessao.user.id

  if (entrada.tipo === 'texto') {
    const { data, error } = await supabase
      .from('materiais')
      .insert({
        professor_id: professorId,
        tipo: 'texto',
        nome: entrada.nome.trim() || 'Texto colado',
        texto: entrada.texto,
        pasta_id: pastaId,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  const { arquivo } = entrada
  const tipo = tipoDoArquivo(arquivo.type)
  if (!tipo) throw new Error('Formato não aceito. Envie PDF, DOCX, imagem ou áudio.')
  if (arquivo.size > TAMANHO_MAX_MATERIAL) throw new Error('Arquivo muito grande — o limite é 25 MB.')

  // O path é `${professor_id}/...`, exigência da policy do bucket (0004).
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${professorId}/${crypto.randomUUID()}.${extensao}`
  const { error: erroUpload } = await supabase.storage
    .from('materiais')
    .upload(path, arquivo, { contentType: arquivo.type })
  if (erroUpload) throw erroUpload

  const { data, error } = await supabase
    .from('materiais')
    .insert({ professor_id: professorId, tipo, nome: arquivo.name, storage_path: path, pasta_id: pastaId })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Só sobe, sem dar a ninguém — é o que a tela de acervo faz. */
export function useSubirAoAcervo(pastaId: string | null = null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovoMaterial) => subirParaOAcervo(entrada, pastaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/**
 * RF-50/51: sobe E entrega. `alunoIds` com vários é o caso da turma — o
 * arquivo entra no bucket UMA vez e ganha N vínculos.
 */
export function useEnviarMaterial(alunoIds: string[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: NovoMaterial) => {
      const materialId = await subirParaOAcervo(entrada)
      if (alunoIds.length > 0) await vincular(materialId, alunoIds)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

async function vincular(materialId: string, alunoIds: string[]) {
  const { error } = await supabase
    .from('materiais_alunos')
    .upsert(
      alunoIds.map((aluno_id) => ({ material_id: materialId, aluno_id })),
      // Reentregar algo que a pessoa já tem não pode ser erro: numa turma o
      // professor clica "dar a todos" sem saber quem já recebeu.
      { onConflict: 'material_id,aluno_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

/**
 * Dá uma PASTA inteira — todos os materiais dela, para todos os destinatários.
 *
 * Existe porque o gesto real do professor quase nunca é "dá este PDF": é
 * "esse aluno vai fazer o Livro 1". Item a item, uma apostila de doze peças
 * são doze cliques numa janela que rola, e a chance de pular um é alta — e um
 * material faltando só aparece no meio da aula seguinte.
 *
 * Um `upsert` só com todos os pares. `ignoreDuplicates` faz o resto: quem já
 * tinha metade da pasta continua com a data de recebimento original, e a
 * ordem da lista dele não embaralha por causa de uma reentrega.
 */
export function useDisponibilizarPasta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ materialIds, alunoIds }: { materialIds: string[]; alunoIds: string[] }) => {
      if (materialIds.length === 0 || alunoIds.length === 0) return
      const pares = materialIds.flatMap((material_id) =>
        alunoIds.map((aluno_id) => ({ material_id, aluno_id })),
      )
      const { error } = await supabase
        .from('materiais_alunos')
        .upsert(pares, { onConflict: 'material_id,aluno_id', ignoreDuplicates: true })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/** Dá um material que já está no acervo para um ou vários alunos. */
export function useDisponibilizar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ materialId, alunoIds }: { materialId: string; alunoIds: string[] }) =>
      vincular(materialId, alunoIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/**
 * Tira o material DESTE aluno. O arquivo continua no acervo e com quem mais o
 * tiver — é a diferença que 0016 criou e que a tela precisa deixar clara.
 */
export function useTirarDoAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ materialId, alunoId }: { materialId: string; alunoId: string }) => {
      const { error } = await supabase
        .from('materiais_alunos')
        .delete()
        .eq('material_id', materialId)
        .eq('aluno_id', alunoId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/**
 * Tira o material de VÁRIOS alunos — a contrapartida de dar para a turma.
 *
 * Sem isto, desfazer uma distribuição para o grupo seria abrir a ficha de cada
 * aluno e tirar um por um. O arquivo continua no acervo: quem some é o acesso.
 */
export function useTirarDeVarios() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ materialId, alunoIds }: { materialId: string; alunoIds: string[] }) => {
      const { error } = await supabase
        .from('materiais_alunos')
        .delete()
        .eq('material_id', materialId)
        .in('aluno_id', alunoIds)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

/**
 * Apaga do ACERVO: some para todo mundo e o arquivo sai do bucket. Os vínculos
 * caem por cascade (0016). Se o arquivo já não existir, a linha some do mesmo
 * jeito — o que importa é não deixar registro apontando para nada.
 */
export function useExcluirMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (material: Material) => {
      if (material.storage_path) {
        await supabase.storage.from('materiais').remove([material.storage_path])
      }
      const { error } = await supabase.from('materiais').delete().eq('id', material.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}

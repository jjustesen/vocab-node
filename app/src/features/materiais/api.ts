import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Material, MaterialTipo } from '@/types/db'

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

/** Sobe o arquivo para o acervo e devolve o id. Não dá a ninguém — quem dá é `useDisponibilizar`. */
async function subirParaOAcervo(entrada: NovoMaterial): Promise<string> {
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
    .insert({ professor_id: professorId, tipo, nome: arquivo.name, storage_path: path })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Só sobe, sem dar a ninguém — é o que a tela de acervo faz. */
export function useSubirAoAcervo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: subirParaOAcervo,
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

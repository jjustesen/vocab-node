import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Material, MaterialTipo } from '@/types/db'

export const chavesMateriais = {
  todos: ['materiais'] as const,
  doAluno: (alunoId: string) => ['materiais', 'aluno', alunoId] as const,
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

/** RF-52: materiais que o professor vinculou a este aluno. */
export function useMateriaisDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesMateriais.doAluno(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase
        .from('materiais')
        .select('*')
        .eq('aluno_id', alunoId!)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
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

/**
 * RF-50/51. Arquivo sobe direto (sem base64, ao contrário do caminho da
 * geração por IA — aqui o conteúdo não passa pela Edge Function, então não
 * precisa virar texto). O path é `${professor_id}/...`, exigência da policy
 * do bucket em 0004_storage_materiais.sql.
 */
export function useEnviarMaterial(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: NovoMaterial) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')
      const professorId = sessao.user.id

      if (entrada.tipo === 'texto') {
        const { error } = await supabase.from('materiais').insert({
          professor_id: professorId,
          aluno_id: alunoId,
          tipo: 'texto',
          nome: entrada.nome.trim() || 'Texto colado',
          texto: entrada.texto,
        })
        if (error) throw error
        return
      }

      const { arquivo } = entrada
      const tipo = tipoDoArquivo(arquivo.type)
      if (!tipo) throw new Error('Formato não aceito. Envie PDF, DOCX, imagem ou áudio.')
      if (arquivo.size > TAMANHO_MAX_MATERIAL) throw new Error('Arquivo muito grande — o limite é 25 MB.')

      const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${professorId}/${crypto.randomUUID()}.${extensao}`
      const { error: erroUpload } = await supabase.storage
        .from('materiais')
        .upload(path, arquivo, { contentType: arquivo.type })
      if (erroUpload) throw erroUpload

      const { error } = await supabase.from('materiais').insert({
        professor_id: professorId,
        aluno_id: alunoId,
        tipo,
        nome: arquivo.name,
        storage_path: path,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesMateriais.doAluno(alunoId) }),
  })
}

/** Apaga a linha e o arquivo. Se o arquivo já não existir, a linha some do mesmo jeito. */
export function useExcluirMaterial(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (material: Material) => {
      if (material.storage_path) {
        await supabase.storage.from('materiais').remove([material.storage_path])
      }
      const { error } = await supabase.from('materiais').delete().eq('id', material.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesMateriais.doAluno(alunoId) }),
  })
}

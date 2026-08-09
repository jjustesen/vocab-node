import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * A sessão atual é mesmo de um PROFESSOR?
 *
 * Professor e aluno logam no mesmo Supabase Auth — o GoTrue confere a senha e
 * não sabe nada sobre perfis. Quem separa as duas áreas é o produto, e a marca
 * de "sou professor" é ter linha em `professores` (criada pelo trigger da
 * migration 0002, só para quem se cadastra como professor).
 *
 * `maybeSingle` em vez de `single`: a ausência da linha é a resposta que
 * estamos procurando, não um erro a tratar. Erro de verdade (rede, RLS) ainda
 * sobe, porque tratar falha de rede como "não é professor" derrubaria a sessão
 * de um professor legítimo com internet ruim.
 */
export function usePerfilProfessor(habilitado: boolean) {
  return useQuery({
    queryKey: ['perfil-professor'],
    enabled: habilitado,
    staleTime: Infinity, // não muda durante a sessão
    queryFn: async (): Promise<boolean> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) return false
      const { data, error } = await supabase
        .from('professores')
        .select('id')
        .eq('id', sessao.user.id)
        .maybeSingle()
      if (error) throw error
      return data !== null
    },
  })
}

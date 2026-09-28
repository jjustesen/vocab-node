// Deno Edge Function — sem verify-jwt: quem chama ainda não tem conta. A
// autorização é a posse do token do link (0019), validado por hash.
//
// Diferente do convite individual (convite-concluir) e do link aberto, aqui a
// conta de auth nasce NO SERVIDOR (auth.admin.createUser), não num signUp do
// navegador. Motivo: a ordem importa. Link, vaga no plano e e-mail repetido
// são conferidos ANTES de existir usuário; se o signUp viesse primeiro, cada
// recusa deixaria um usuário de auth órfão, sem aluno, ocupando o e-mail. E se
// algo falha depois do createUser, a própria função apaga o usuário.
// O front recebe ok e só então faz signInWithPassword com o cliente do aluno.
//
// Efeito colateral consciente: `email_confirm: true` dispensa a confirmação
// por e-mail — o fluxo funciona com "Confirm email" ligado ou desligado no
// projeto, mas o e-mail não é verificado. Ver o relatório da feature.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import {
  criarAlunoComConta,
  ehFalha,
  limiteDeAlunosAtingido,
  resolverLinkDeCadastro,
} from '../_shared/cadastro-aluno.ts'

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown; nome?: unknown; email?: unknown; senha?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const nome = typeof corpo.nome === 'string' ? corpo.nome.trim() : ''
  // GoTrue guarda o e-mail em minúsculas; `contas_aluno.email` vem sempre de
  // lá. Normalizar aqui é o que faz a checagem de repetido abaixo funcionar.
  const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : ''
  const senha = typeof corpo.senha === 'string' ? corpo.senha : ''
  if (!nome || nome.length > 120) return respostaErro('Informe seu nome.')
  if (!EMAIL_VALIDO.test(email)) return respostaErro('Informe um e-mail válido.')
  if (senha.length < 6) return respostaErro('A senha precisa ter pelo menos 6 caracteres.')

  const db = clienteAdmin()
  const link = await resolverLinkDeCadastro(db, corpo.token)
  if (ehFalha(link)) return respostaErro(link.mensagem, link.status)

  // Antes da vaga: quem já é aluno deste professor não deve ouvir "sem vagas",
  // e sim "você já tem conta, entre".
  const { data: contaExistente } = await db
    .from('contas_aluno')
    .select('id')
    .eq('professor_id', link.professor_id)
    .eq('email', email)
    .maybeSingle()
  if (contaExistente) {
    return respostaJson(
      { erro: 'Este e-mail já está cadastrado com este professor. Entre com sua senha.', codigo: 'ja_cadastrado' },
      409,
    )
  }

  const limite = await limiteDeAlunosAtingido(db, link.professor_id)
  if (limite !== null) {
    return respostaErro(
      'Seu professor atingiu o limite de alunos do plano dele, então o cadastro está fechado por enquanto. Avise-o para liberar uma vaga.',
      403,
    )
  }

  // `perfil: 'aluno'` NÃO é decorativo: sem ele o trigger on_auth_user_created
  // cria também uma conta de PROFESSOR para esta pessoa (migrations 0002/0009).
  const { data: criado, error: erroAuth } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { perfil: 'aluno', nome },
  })

  if (erroAuth || !criado?.user) {
    const codigo = (erroAuth as { code?: string } | null)?.code
    if (codigo === 'email_exists' || /already/i.test(erroAuth?.message ?? '')) {
      // O painel resolve a conta do aluno por user_id com maybeSingle — uma
      // segunda linha em contas_aluno para o mesmo usuário quebraria o login
      // dele em tudo. Sem multi-professor no produto, barramos com clareza.
      const { data: emOutroProfessor } = await db.from('contas_aluno').select('id').eq('email', email).limit(1)
      return respostaErro(
        emOutroProfessor?.length
          ? 'Este e-mail já tem conta de aluno com outro professor. Use outro e-mail para se cadastrar aqui.'
          : 'Este e-mail já tem cadastro na plataforma. Use outro e-mail para se cadastrar como aluno.',
        409,
      )
    }
    if (codigo === 'weak_password') {
      return respostaErro('Senha fraca demais. Use uma senha mais longa, misturando letras e números.')
    }
    return respostaErro(erroAuth?.message ?? 'Não foi possível criar a conta.', 500)
  }

  const resultado = await criarAlunoComConta(db, {
    professorId: link.professor_id,
    userId: criado.user.id,
    email,
    nome,
  })
  if (ehFalha(resultado)) {
    // Sem aluno por trás, a conta de auth só serviria para ocupar o e-mail.
    await db.auth.admin.deleteUser(criado.user.id)
    return respostaErro(resultado.mensagem, resultado.status)
  }

  return respostaJson({ ok: true, alunoNome: nome, email })
})

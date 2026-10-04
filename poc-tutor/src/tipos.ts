/**
 * O contrato entre as três peças da POC:
 *
 *   roteiro (dados)  →  controlador (decide)  ←  avaliação (modelo de linguagem / voz)
 *                            ↓
 *                         ações (o tutor fala)
 *
 * O controlador é quem guarda a posição na aula e decide o PRÓXIMO PASSO. O
 * modelo de linguagem só classifica a resposta do aluno (`Avaliacao`) e dá voz
 * às decisões (`Acao`). É a separação que a análise defende (§10): um prompt
 * orienta o tom, mas não segura a frase em construção, a pista pendente nem o
 * ponto de retorno — e é exatamente isso que faz a dinâmica do professor.
 */

// ── Roteiro ──────────────────────────────────────────────────────────────────

/**
 * R06: o que o aluno está fazendo — e, portanto, como a resposta é avaliada.
 *
 * - `repeticao`: repetir um modelo que o tutor acabou de dizer.
 * - `construcao`: dizer em inglês uma frase pedida em português.
 * - `substituicao`: transformar a última frase aceita a partir de uma pista.
 * - `conversa`: responder ao CONTEÚDO de uma pergunta; várias respostas valem.
 */
export type TipoItem = 'repeticao' | 'construcao' | 'substituicao' | 'conversa'

export type ErroPrevisto = {
  exemplo: string
  habilidade: string
  /** A pista de autocorreção para este erro — o nível 1 de ajuda. */
  pista: string
}

export type Item = {
  id: string
  tipo: TipoItem
  /** O primeiro item da aula: decide se o aluno precisa de modelo. */
  calibracao?: boolean
  /** `construcao`: o que pedir em português. */
  solicitacao?: string
  /** `substituicao`: a pista curta, em inglês. */
  pista?: string
  /** `repeticao`: o que o tutor diz para o aluno repetir. */
  modelo?: string
  /** `conversa`: a pergunta real. */
  pergunta?: string
  /** `conversa`: o que conta como resposta pertinente. */
  criterio?: string
  exemplos?: string[]
  acompanhamentos?: string[]
  /** A resposta de referência. Ausente na conversa, onde não há uma só. */
  alvo?: string
  /** R07: variantes naturais equivalentes que também valem. */
  variantes?: string[]
  habilidades: string[]
  /** Ajuda progressiva: [pista de autocorreção, trecho]. O nível 3 é o alvo inteiro. */
  ajudas?: string[]
  errosPrevistos?: ErroPrevisto[]
  /** Escada de pré-requisito (em `Roteiro.apoios`) para quando faltar a base. */
  apoio?: string
}

export type Bloco = { id: string; objetivo: string; itens: Item[] }

export type Apoio = { objetivo: string; degraus: Item[] }

export type Painel = {
  estruturas: string[]
  vocabulario: { en: string; pt: string }[]
  exemplos: string[]
  alertas: string[]
}

export type Roteiro = {
  id: string
  titulo: string
  abertura: string
  /** R04: o que o aluno VÊ. Nunca as respostas das cadeias. */
  painel: Painel
  blocos: Bloco[]
  apoios: Record<string, Apoio>
  conversa: Item[]
  /** R11: por habilidade, um item em contexto novo para testar de novo. */
  recuperacao: Record<string, Item>
}

// ── Avaliação (entrada do controlador) ───────────────────────────────────────

/**
 * O que aconteceu no turno do aluno. Quem produz: o modelo de linguagem
 * (`adequada`, `erro`, `falta_prerequisito`, `duvida`) e a interface de voz
 * (`audio_incerto`, `silencio`, `pedido_ajuda` vindo de um botão).
 *
 * Três avaliações separadas, como pede a análise (§7): transformação pedida,
 * correção linguística e confiança do reconhecimento. Áudio incerto NUNCA vira
 * `erro` — é um tipo à parte justamente para não contaminar o desempenho.
 */
export type Avaliacao =
  /** `observacao`: na conversa, a reação curta do tutor ao conteúdo (em inglês). */
  | { tipo: 'adequada'; reconhecido: string; observacao?: string }
  | {
      tipo: 'erro'
      reconhecido: string
      /** O problema prioritário — um por vez. */
      habilidade: string
      problema: string
      /** O que acertou, para reconhecer antes de corrigir ("Você acertou having…"). */
      acertoParcial?: string
      /** Pista escrita pelo avaliador para um erro que o roteiro não previu. */
      dica?: string
    }
  | { tipo: 'falta_prerequisito'; reconhecido: string; problema: string; apoio?: string }
  /**
   * O aluno respondeu SÓ à pergunta da última pista ("weren't"), e certo. Não
   * é a frase pedida — é o passo do meio do professor: "tem um errinho no
   * aren't, como se diz 'estavam'?" → "weren't" → "isso, agora a frase toda".
   */
  | { tipo: 'parte_certa'; reconhecido: string }
  | { tipo: 'audio_incerto'; reconhecido?: string }
  /** `resposta`: a explicação curta, em português, que o avaliador já preparou. */
  | { tipo: 'duvida'; pergunta: string; resposta?: string }
  /** `ajuda`: o pedaço específico que o aluno pediu ("Educada é polite."), quando pediu algo específico. */
  | { tipo: 'pedido_ajuda'; ajuda?: string }
  | { tipo: 'silencio' }
  /** O aluno escolheu pular: o item fica pendente (com o modelo dito), e a aula segue. */
  | { tipo: 'pular' }

// ── Ações (saída do controlador) ─────────────────────────────────────────────

/** Por que este pedido está sendo feito — muda como o tutor o anuncia. */
export type Contexto = 'calibracao' | 'cadeia' | 'apoio' | 'retorno' | 'recuperacao' | 'conversa'

/**
 * O que o tutor deve fazer agora. O controlador decide; o modelo de linguagem
 * só põe em palavras. Cada turno pode ter mais de uma (confirmar o acerto E
 * dar a próxima pista).
 */
export type Acao =
  | { tipo: 'abrir'; texto: string }
  | { tipo: 'solicitar'; item: Item; contexto: Contexto }
  /** Dar o modelo em inglês, verificar o sentido e pedir repetição. */
  | { tipo: 'modelar'; item: Item; modelo: string }
  | { tipo: 'confirmar_acerto'; item: Item; reconhecido: string; resultado: Resultado; observacao?: string }
  /** Ajuda de nível 1–3 e, em seguida, pedir a frase INTEIRA de novo (R08). */
  | { tipo: 'ajudar'; item: Item; nivel: NivelAjuda; conteudo: string; acertoParcial?: string }
  | { tipo: 'confirmar_audio'; item: Item; reconhecido?: string }
  | { tipo: 'responder_duvida'; pergunta: string; resposta?: string; retomar: Item }
  | { tipo: 'abrir_apoio'; objetivo: string; retornoA: Item }
  /** Item encerrado sem produção adequada mesmo depois do modelo — fica pendente, não dominado. */
  | { tipo: 'registrar_pendente'; item: Item; modelo: string }
  /** Confirmar o pedaço que o aluno acertou e pedir a frase inteira de novo. */
  | { tipo: 'pedir_frase_inteira'; item: Item; reconhecido: string }
  | { tipo: 'iniciar_conversa' }
  | { tipo: 'encerrar'; resumo: Resumo }

// ── Sessão ───────────────────────────────────────────────────────────────────

/** 0 = sem ajuda; 1 = pista de autocorreção; 2 = trecho; 3 = frase-modelo inteira. */
export type NivelAjuda = 0 | 1 | 2 | 3

/**
 * Como o item foi concluído. A diferença entre `autonomo` e o resto é o que a
 * recuperação mede: acerto depois de ouvir o modelo não prova uso independente.
 */
export type Resultado = 'autonomo' | 'com_pista' | 'com_modelo' | 'apos_apoio' | 'pendente'

export type Origem = 'bloco' | 'apoio' | 'recuperacao' | 'conversa'

export type Tentando = {
  item: Item
  origem: Origem
  contexto: Contexto
  blocoId: string | null
  /** Respostas avaliadas como erro. Áudio incerto, dúvida e silêncio não contam. */
  tentativas: number
  nivelAjuda: NivelAjuda
  /** Erros cometidos já com o modelo em mãos — no segundo, o item fica pendente. */
  errosComModelo: number
  passouPorApoio: boolean
  /** Em recuperação: qual dificuldade está sendo testada de novo. */
  habilidadeRecuperada?: string
  /** A última pista dada neste item — para o avaliador saber a que o aluno está respondendo. */
  ultimaAjuda?: string
}

export type Passo =
  | { tipo: 'item'; item: Item; origem: Origem; contexto: Contexto; blocoId: string | null; habilidadeRecuperada?: string }
  | { tipo: 'fim_de_bloco'; blocoId: string }
  | { tipo: 'retorno' }
  | { tipo: 'inicio_conversa' }
  | { tipo: 'fechamento' }
  | { tipo: 'encerrar' }

export type Dificuldade = {
  habilidade: string
  itemId: string
  blocoId: string | null
  /** null = ainda não testada de novo; true/false = resultado da recuperação. */
  recuperada: boolean | null
  agendada: boolean
}

export type Evento = {
  seq: number
  tipo: 'avaliacao' | 'acao' | 'decisao'
  itemId?: string
  /** R12 / critério 9: o PORQUÊ de cada decisão, em português. */
  motivo?: string
  dados?: unknown
}

export type Sessao = {
  roteiro: Roteiro
  fila: Passo[]
  atual: Tentando | null
  /** O item que esperou uma escada de apoio terminar, com a memória da cadeia dele. */
  suspenso: { tentando: Tentando; fraseBase: string | null; ultimaAceita: string | null } | null
  fraseBase: string | null
  /** R05: só muda com acerto. Uma resposta errada não a sobrescreve. */
  ultimaAceita: string | null
  calibracao: 'pendente' | 'autonomo' | 'precisou_modelo'
  dificuldades: Dificuldade[]
  resultados: {
    itemId: string
    origem: Origem
    resultado: Resultado
    reconhecido: string | null
    alvo: string | null
  }[]
  registro: Evento[]
  encerrada: boolean
}

export type Resumo = {
  autonomos: string[]
  comAjuda: string[]
  pendentes: string[]
  /** Habilidades que exigiram ajuda e não foram confirmadas na recuperação. */
  paraRevisar: string[]
  recuperadas: string[]
}

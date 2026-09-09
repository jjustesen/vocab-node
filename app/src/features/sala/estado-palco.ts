/**
 * O palco da sala — o modelo que separa esta videochamada de um Zoom.
 *
 * No padrão de mercado, mostrar um documento é COMPARTILHAR TELA: o outro lado
 * recebe os pixels do seu navegador, e o conteúdo continua morando fora da
 * chamada. Aqui é o contrário. O palco é um pedaço de ESTADO da sala: as duas
 * pontas recebem o mesmo objeto e renderizam cada uma no próprio tamanho de
 * tela. O aluno não está vendo o notebook do professor — está vendo o mesmo
 * material, no celular dele, na resolução dele.
 *
 * Disso saem três consequências que valem por toda a pasta:
 *
 *   1. A LOUSA NÃO É UM MODO, é uma camada. Não existe "ver o material" OU
 *      "desenhar": desenha-se POR CIMA do que está no palco. Por isso o traço
 *      viaja num quadro lógico de 1600x900 (ver `Lousa.tsx`) — ele precisa
 *      colar na coordenada do conteúdo, não no pixel de quem desenhou.
 *
 *   2. A ANOTAÇÃO PERTENCE AO CONTEÚDO. Virar a página do PDF troca de
 *      superfície: o rabisco da página 3 não vaza para a 4, e volta quando a
 *      página 3 voltar. É o que `superficieDo` resolve.
 *
 *   3. QUEM CONTROLA O PALCO É O PROFESSOR, e só ele. Houve uma versão com
 *      "passar o giz" — o comando do palco viajando para um aluno — e ela foi
 *      removida: numa turma, transferir o controle é uma coisa a mais para dar
 *      errado ao vivo (o giz fica com quem já saiu, o professor precisa
 *      retomar, o aluno mexe sem querer) em troca de um gesto que a aula não
 *      pedia. O aluno participa pelo documento, que continua sendo dos dois.
 */

/** O que a pessoa PODE fazer. Espelha o `papel` que `sala-entrar` devolve. */
export type Papel = 'professor' | 'aluno'

/**
 * QUEM a pessoa é — `prof-<id>` ou `aluno-<id>`, estável entre sessões.
 *
 * Papel e identidade eram a mesma coisa enquanto a sala tinha exatamente dois
 * ocupantes. Numa turma deixam de ser: "a camada do aluno", "a trava do aluno"
 * e "apagar o que o aluno escreveu" perdem sentido com três alunos na sala.
 * Papel responde o que pode; `ParticipanteId` responde quem fez.
 */
export type ParticipanteId = string

/**
 * O que está no centro da tela agora.
 *
 * `material` carrega a URL ASSINADA junto, e não só o id: o aluno sem conta
 * (a terceira porta de 0012) não tem sessão de Postgres para pedir a própria
 * URL ao Storage. Quem tem sessão assina e manda pronto pela chamada. A
 * assinatura vale 1h — mais que qualquer aula.
 */
export type Palco =
  | { tipo: 'nenhum' }
  | { tipo: 'branco' }
  | { tipo: 'documento' }
  | {
      tipo: 'material'
      materialId: string
      nome: string
      /** PDF e imagem; `paginas` é 1 para imagem. */
      url: string
      formato: 'pdf' | 'imagem'
      paginas: number
      pagina: number
      /**
       * Largura ÷ altura do conteúdo, medida por quem subiu o material ao
       * palco e mandada junto. Não é enfeite de layout: é o que garante que as
       * duas pontas desenham a MESMA caixa, e portanto que a anotação cai no
       * mesmo ponto (ver o cabeçalho de `Lousa.tsx`). Se cada lado medisse
       * sozinho, o rabisco sairia deslocado enquanto o outro ainda carrega o
       * arquivo. Uma folha A4 em pé dá ~0.707.
       */
      proporcao: number
    }

export const PALCO_VAZIO: Palco = { tipo: 'nenhum' }

/**
 * COMO o palco está enquadrado — o que o professor está olhando de perto.
 *
 * Separado de `Palco` porque muda por outro motivo e num outro ritmo: o palco
 * troca quando ele sobe outro material, a vista troca dezenas de vezes por
 * minuto enquanto ele percorre o exercício. Misturar os dois faria cada
 * arrastar de página reenviar a URL assinada do PDF inteiro.
 *
 * ── Por que o enquadramento é do professor, e não de cada um ────────────────
 *
 * Porque quem está dando a aula é ele. "Olha aqui nesta linha" só funciona se
 * "aqui" for o mesmo lugar nas duas telas — ampliar sozinho e falar como se o
 * outro estivesse vendo o mesmo pedaço é exatamente o mal-entendido que a
 * sala existe para evitar. O aluno continua podendo mexer nos controles dele
 * (no celular, às vezes precisa), e volta a acompanhar assim que o professor
 * mexe de novo.
 */
export type Vista = {
  /** 'encaixar' mostra a página inteira; 'largura' estica até a borda. */
  ajuste: 'encaixar' | 'largura'
  /** Multiplicador da lupa. 1 = o tamanho que o `ajuste` já dá. */
  zoom: number
  /**
   * O centro do enquadramento, em FRAÇÃO do conteúdo (0..1) — nunca em pixels
   * de rolagem. O professor está num notebook e o aluno num celular: a mesma
   * quantidade de pixels rolados cai em pontos diferentes da página. O centro
   * relativo é a única medida que quer dizer a mesma coisa nas duas telas.
   */
  cx: number
  cy: number
}

export const VISTA_PADRAO: Vista = { ajuste: 'encaixar', zoom: 1, cx: 0.5, cy: 0.5 }

export type MensagemPalco =
  /**
   * O professor anuncia o palco inteiro. Objeto pequeno: não vale diferenciar.
   *
   * Só ele emite; os alunos apenas recebem. Não é regra de permissão do canal
   * (o data channel do LiveKit é aberto para todos), é a forma do estado: com
   * uma fonte só, não existe "duas versões do palco" para reconciliar.
   */
  | { t: 'palco'; palco: Palco; vista: Vista }
  /**
   * Só o enquadramento mudou. Mensagem à parte da de cima porque é a que
   * viaja durante o arrasto — mandar o palco inteiro a cada quadro seria
   * repetir a URL do material dezenas de vezes por minuto sem necessidade.
   */
  | { t: 'vista'; vista: Vista }
  /** Quem chega depois pergunta; o professor responde. */
  | { t: 'pedir-estado' }

/**
 * A chave da superfície de anotação. Traços são guardados e filtrados por ela,
 * então dois conteúdos diferentes nunca dividem rabiscos — e voltar para a
 * página anterior traz o que estava lá.
 */
export function superficieDo(palco: Palco): string {
  switch (palco.tipo) {
    case 'nenhum':
      return 'nenhum'
    case 'branco':
      return 'branco'
    case 'documento':
      return 'documento'
    case 'material':
      return `material:${palco.materialId}:${palco.pagina}`
  }
}

/**
 * A proporção da CAIXA do palco. Lousa em branco e documento são 16:9 — é a
 * forma de tela que sobra depois da tira de vídeo, e ninguém está anotando
 * sobre um formato herdado de arquivo. Material usa a proporção do arquivo.
 */
export function proporcaoDo(palco: Palco): number {
  return palco.tipo === 'material' ? palco.proporcao : 16 / 9
}

/** Rótulo curto do palco, para a barra de controle dizer o que está no ar. */
export function nomeDo(palco: Palco): string {
  switch (palco.tipo) {
    case 'nenhum':
      return 'Só vídeo'
    case 'branco':
      return 'Lousa'
    case 'documento':
      return 'Documento'
    case 'material':
      return palco.nome
  }
}

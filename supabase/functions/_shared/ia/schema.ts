/**
 * Schema para saída estruturada — docs/CONTRATO-QUESTOES.md §5, literal.
 * Fica só no subconjunto que o Gemini aceita: object, array, string, enum,
 * required. Se mudar aqui, mude lá também.
 */
export const ATIVIDADE_GERADA_SCHEMA = {
  type: 'object',
  required: ['titulo', 'nivel', 'habilidades', 'questoes'],
  properties: {
    titulo: { type: 'string' },
    nivel: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'] },
    habilidades: {
      type: 'array',
      items: { type: 'string', enum: ['leitura', 'escrita', 'listening', 'fala', 'vocabulario', 'gramatica'] },
    },
    questoes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tipo', 'enunciado', 'opcoes', 'resposta_correta', 'respostas_aceitas', 'pares', 'explicacao'],
        properties: {
          tipo: {
            type: 'string',
            enum: [
              'multipla_escolha',
              'lacuna',
              'ordenar_palavras',
              'ligar_colunas',
              'verdadeiro_falso',
              'resposta_curta',
              'pronuncia',
              'ordenar_audio',
            ],
          },
          enunciado: { type: 'string' },
          opcoes: { type: 'array', items: { type: 'string' } },
          resposta_correta: { type: 'string' },
          respostas_aceitas: { type: 'array', items: { type: 'string' } },
          pares: {
            type: 'array',
            items: {
              type: 'object',
              required: ['esquerda', 'direita'],
              properties: {
                esquerda: { type: 'string' },
                direita: { type: 'string' },
              },
            },
          },
          explicacao: { type: 'string' },
        },
      },
    },
  },
}

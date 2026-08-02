import type { AtividadeGeradaIA } from './api-ia'
import type { NivelCefr } from '@/types/db'

/**
 * Modelo do lote (P4b): UMA configuração padrão vale para todos os arquivos e
 * cada item guarda só os campos que sobrescreveu. Guardar o override como
 * `Partial` em vez de uma cópia completa da config é o que faz "mudei o nível
 * padrão de B1 para B2" continuar valendo para os itens que só personalizaram
 * a quantidade — se cada item carregasse uma config inteira, editar o padrão
 * depois de personalizar um arquivo não teria efeito nenhum sobre ele.
 */
export type ConfigGeracao = {
  nivel: NivelCefr
  quantidade: number
  habilidades: string[]
  foco: string
}

export type OverrideConfig = Partial<ConfigGeracao>

export const CONFIG_PADRAO: ConfigGeracao = {
  nivel: 'B1',
  quantidade: 10,
  habilidades: [],
  foco: '',
}

export const MAXIMO_ARQUIVOS_POR_LOTE = 20

/** Quantos itens são gerados ao mesmo tempo. Ver comentário em GerarLotePage. */
export const GERACOES_SIMULTANEAS = 2

export type EstadoItem = 'na_fila' | 'gerando' | 'pronta' | 'erro'

export type ItemLote = {
  id: string
  nome: string
  tamanho: number
  tipo: 'imagem' | 'pdf'
  conteudo: string
  mimeType: string
  override: OverrideConfig
  estado: EstadoItem
  erro?: string
  gerada?: AtividadeGeradaIA
  /** Só vale na revisão: itens desmarcados não são salvos. */
  selecionada: boolean
}

export function resolverConfig(padrao: ConfigGeracao, override: OverrideConfig): ConfigGeracao {
  return { ...padrao, ...override }
}

export function ehPersonalizado(item: ItemLote): boolean {
  return Object.keys(item.override).length > 0
}

/** Liga/desliga um campo do override — desligar volta a herdar o padrão. */
export function alternarOverride<C extends keyof ConfigGeracao>(
  override: OverrideConfig,
  campo: C,
  valor: ConfigGeracao[C] | undefined,
): OverrideConfig {
  const novo = { ...override }
  if (valor === undefined) delete novo[campo]
  else novo[campo] = valor
  return novo
}

export function tamanhoLegivel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Nome do arquivo sem extensão — título de reserva quando a IA não sugere um. */
export function tituloDoArquivo(nome: string): string {
  return nome.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Atividade'
}

/** "habilidade nova" → "habilidade_nova": os ids de habilidade e de bloco do roteiro. */
export function slug(v: string): string {
  return (
    v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'novo'
  )
}

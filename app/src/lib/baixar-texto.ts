/**
 * Baixa um texto como arquivo `.txt`, gerado no próprio navegador.
 *
 * O material de texto não tem arquivo no Storage — o conteúdo mora na coluna
 * `texto` —, então não há URL para abrir: o arquivo nasce aqui, de um Blob.
 * UTF-8 com BOM porque o Bloco de Notas antigo do Windows lê arquivo sem BOM
 * como ANSI e troca todo acento por lixo ("aÃ§Ã£o").
 */
export function baixarComoTxt(nome: string, texto: string) {
  const blob = new Blob(['﻿', texto], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeDoTxt(nome)
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revogar na hora pode cancelar o download em alguns navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Vocabulário: aula 3" → "Vocabulário aula 3.txt" — sem os caracteres que o Windows recusa. */
function nomeDoTxt(nome: string): string {
  const limpo = nome.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'texto'
  return /\.txt$/i.test(limpo) ? limpo : `${limpo}.txt`
}

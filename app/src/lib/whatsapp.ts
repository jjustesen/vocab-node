/**
 * Link de conversa no WhatsApp. Com telefone cadastrado abre direto na conversa
 * do aluno; sem telefone cai no seletor de contatos do próprio WhatsApp — que é
 * o comportamento que os modais de envio já tinham.
 */
export function linkWhatsapp(mensagem: string, telefone?: string | null): string {
  const texto = encodeURIComponent(mensagem)
  const digitos = (telefone ?? '').replace(/\D/g, '')
  // 10 ou 11 dígitos = número brasileiro sem DDI (fixo, ou celular com o 9).
  // Acima disso presumimos que o professor já digitou o DDI.
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}

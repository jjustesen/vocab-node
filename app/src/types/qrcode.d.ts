/**
 * Declaração mínima de `qrcode` — de propósito, no lugar de @types/qrcode:
 * o pacote de tipos importa 'stream' e arrasta @types/node para o programa
 * inteiro, trocando os tipos DOM de setTimeout/setInterval e quebrando
 * arquivos que nem usam QR (visto em RespostaPronuncia). Só declaramos a
 * superfície que o app usa (build de navegador do pacote).
 */
declare module 'qrcode' {
  export type QRCodeToDataURLOptions = {
    width?: number
    margin?: number
    color?: { dark?: string; light?: string }
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>
  }
  export default QRCode
}

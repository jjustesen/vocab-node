import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Material } from '@/types/db'
import { VISUAL_TIPO } from './visual'
import { garantirMiniatura, temMiniatura, urlDaMiniatura, VALIDADE_MINIATURA_S } from './miniatura'

/**
 * O quadradinho à esquerda de cada material: a primeira página do PDF, a
 * própria foto — e, para o que não tem cara (áudio, Word, texto) ou enquanto
 * a miniatura não chega, o ícone colorido do tipo, que é o que sempre esteve
 * ali. A troca é silenciosa: a linha nunca fica com um buraco esperando.
 *
 * O PDF leva o selo do tipo no rodapé: uma página de apostila e uma foto de
 * página de apostila são iguais em 48px, e o professor precisa saber qual vai
 * abrir.
 */
export function MiniaturaDoMaterial({
  material,
  tamanho = 'h-10 w-10 rounded-2xl',
  icone = 'h-5 w-5',
}: {
  material: Pick<Material, 'tipo' | 'storage_path'>
  /** Classes de tamanho e canto — cada lista tem o seu. */
  tamanho?: string
  icone?: string
}) {
  const qc = useQueryClient()
  const { Icone, cor, rotulo } = VISUAL_TIPO[material.tipo]
  const caminho = temMiniatura(material) ? material.storage_path : null
  const { tipo } = material

  const { data: url } = useQuery({
    queryKey: ['miniatura', caminho],
    enabled: Boolean(caminho),
    // Antes de a assinatura vencer, com folga.
    staleTime: (VALIDADE_MINIATURA_S - 10 * 60) * 1000,
    queryFn: () => urlDaMiniatura(caminho!),
  })

  // Material antigo, sem miniatura: gera agora e mostra assim que subir.
  useEffect(() => {
    if (!caminho || url !== null) return
    // Invalida mesmo que esta linha já tenha saído da tela: a mesma miniatura
    // aparece em outras listas, e o cache é compartilhado.
    void garantirMiniatura({ tipo, storage_path: caminho }).then((gerou) => {
      if (gerou) void qc.invalidateQueries({ queryKey: ['miniatura', caminho] })
    })
  }, [caminho, tipo, url, qc])

  // A URL pode existir e a imagem falhar (assinatura vencida numa aba
  // esquecida aberta): aí volta para o ícone em vez de mostrar imagem quebrada.
  const [falhou, setFalhou] = useState<string | null>(null)

  if (!url || falhou === url) {
    return (
      <span className={`grid shrink-0 place-items-center ${tamanho} ${cor}`}>
        <Icone className={icone} />
      </span>
    )
  }

  // `block`: dentro de um `span` comum (o seletor da sala embrulha a
  // miniatura para o spinner) um span inline ignora altura e largura, e a
  // imagem sai no tamanho natural.
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-neutral-100 ring-1 ring-neutral-200 ${tamanho}`}>
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFalhou(url)}
        // Página de PDF: o topo, onde está o título. Foto: o meio.
        className={`h-full w-full object-cover ${material.tipo === 'pdf' ? 'object-top' : 'object-center'}`}
      />
      {material.tipo === 'pdf' && (
        <span
          className={`absolute inset-x-0 bottom-0 py-px text-center text-[8px] leading-tight font-extrabold tracking-wide ${cor}`}
        >
          {rotulo}
        </span>
      )}
    </span>
  )
}

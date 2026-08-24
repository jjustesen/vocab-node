import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Volume2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

/**
 * A gravação do aluno na questão de pronúncia.
 *
 * O áudio já era guardado desde 26/07/2026 (bucket privado `audio-respostas`,
 * caminho em `respostas.audio_path`) mas nunca tinha chegado à tela — o
 * professor pagava o custo de armazenar e não podia ouvir. É aqui que ele ouve.
 *
 * O bucket é privado e a policy (migration 0005) libera a leitura só para o
 * dono da PRIMEIRA pasta do caminho, que é o professor. Por isso a URL é
 * assinada na hora, e só quando o card aparece.
 */
export function AudioDaResposta({ caminho, pontuacao }: { caminho: string; pontuacao: number | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let cancelado = false
    supabase.storage
      .from('audio-respostas')
      .createSignedUrl(caminho, 3600)
      .then(({ data, error }) => {
        if (cancelado) return
        if (error || !data?.signedUrl) return setErro(true)
        setUrl(data.signedUrl)
      })
    return () => {
      cancelado = true
    }
  }, [caminho])

  if (erro) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Não consegui carregar a gravação desta resposta.
      </p>
    )
  }

  return (
    <div className="mt-3 rounded-2xl bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-neutral-600">
        <Volume2 className="h-3.5 w-3.5" />
        Gravação do aluno
        {pontuacao !== null && (
          <span className="ml-auto font-mono font-bold text-neutral-400">{pontuacao}/100</span>
        )}
      </p>
      {url ? (
        <audio controls preload="none" src={url} className="w-full">
          Seu navegador não reproduz áudio.
        </audio>
      ) : (
        <p className="flex items-center gap-2 py-2 text-xs text-neutral-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando o áudio...
        </p>
      )}
    </div>
  )
}

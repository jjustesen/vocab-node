import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useAtualizarAluno } from './api'
import { NIVEIS } from '@/types/questao'
import type { Aluno, NivelCefr } from '@/types/db'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** RF-11: os campos opcionais do aluno — nada aqui é obrigatório, só o nome (já preenchido na criação). */
export function EditarAlunoModal({ aluno, aoFechar }: { aluno: Aluno; aoFechar: () => void }) {
  const atualizar = useAtualizarAluno()
  const [nome, setNome] = useState(aluno.nome)
  const [email, setEmail] = useState(aluno.email ?? '')
  const [telefone, setTelefone] = useState(aluno.telefone ?? '')
  const [nivel, setNivel] = useState<NivelCefr | ''>(aluno.nivel_cefr ?? '')
  const [valorMensal, setValorMensal] = useState(aluno.valor_mensal?.toString() ?? '')
  const [diaSemana, setDiaSemana] = useState(aluno.dia_semana?.toString() ?? '')
  const [horario, setHorario] = useState(aluno.horario ?? '')
  const [observacoes, setObservacoes] = useState(aluno.observacoes ?? '')

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    await atualizar.mutateAsync({
      id: aluno.id,
      campos: {
        nome: nome.trim(),
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        nivel_cefr: nivel || null,
        valor_mensal: valorMensal ? Number(valorMensal) : null,
        dia_semana: diaSemana === '' ? null : Number(diaSemana),
        horario: horario || null,
        observacoes: observacoes.trim() || null,
      },
    })
    aoFechar()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-extrabold">Editar aluno</h2>
          <button type="button" onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-bold text-neutral-600">Nome</span>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-neutral-600">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-neutral-600">Telefone</span>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
          </label>
        </div>

        <div className="mt-3">
          <span className="text-xs font-bold text-neutral-600">Nível</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NIVEIS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNivel(nivel === n ? '' : n)}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                  nivel === n ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-500'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Valor da mensalidade (R$)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valorMensal}
            onChange={(e) => setValorMensal(e.target.value)}
            placeholder="200.00"
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-neutral-600">Aula fixa — dia</span>
            <select
              value={diaSemana}
              onChange={(e) => setDiaSemana(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">Sem dia fixo</option>
              {DIAS_SEMANA.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-neutral-600">Horário</span>
            <input
              type="time"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Observações</span>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        {atualizar.error && (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            {(atualizar.error as Error).message}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="flex-1 rounded-full px-5 py-3 text-sm font-bold text-neutral-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={atualizar.isPending || !nome.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {atualizar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}

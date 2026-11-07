import { describe, it, expect } from 'vitest'
import codigoModulo from '../../pocketbase/hooks/googleAgendaSync.js?raw'

// O módulo dos hooks é CommonJS (module.exports) para rodar no JSVM do PocketBase.
// Aqui ele é avaliado no Node com o mesmo contrato, sem import de Node (QA não permite).
function carregarModuloHooks() {
  const modulo = { exports: {} as Record<string, unknown> }
  // eslint-disable-next-line no-new-func
  const fabricar = new Function('module', 'exports', codigoModulo as string)
  fabricar(modulo, modulo.exports)
  return modulo.exports as typeof import('../../pocketbase/hooks/googleAgendaSync.js')
}

const sync = carregarModuloHooks()

const JANELA = {
  timeMin: '2026-10-08T00:00:00.000Z',
  timeMax: '2027-01-06T00:00:00.000Z',
}

// Cria adapters em memória com registros simples { google_event_id, origem, data_inicio }
function memoria(regsIniciais: any[] = []) {
  let proximoId = 1
  const registros: any[] = regsIniciais.map((r) => ({
    id: 'rec_' + proximoId++,
    origem: 'google',
    ...r,
  }))

  const adapters = {
    buscarPorGoogleId: (gId: string) => registros.find((r) => r.google_event_id === gId) ?? null,
    criar: (campos: any, gId: string) => {
      const rec: any = {
        id: 'rec_' + proximoId++,
        origem: 'google',
        google_event_id: gId,
        ...campos,
      }
      registros.push(rec)
    },
    atualizar: (rec: any, campos: any) => Object.assign(rec, campos),
    salvar: (_rec: any) => {},
    remover: (rec: any) => {
      const i = registros.indexOf(rec)
      if (i >= 0) registros.splice(i, 1)
    },
    listarVinculados: () =>
      registros.filter(
        (r) => r.google_event_id && (r.origem === 'google' || r.origem === 'sistema'),
      ),
  }
  return { registros, adapters }
}

const gEvento = (id: string, dataInicio: string, dataFim?: string) => ({
  id,
  status: 'confirmed',
  summary: 'Evento ' + id,
  start: { dateTime: dataInicio },
  end: { dateTime: dataFim ?? dataInicio },
})

describe('deveRemover — deleção lá = deleção aqui', () => {
  it('evento ausente na resposta da API (excluído no Google) é removido', () => {
    const alvo = { google_event_id: 'abc123', data_inicio: '2026-11-20T10:00:00.000Z' }
    expect(sync.deveRemover(alvo, ['outro1', 'outro2'], JANELA)).toBe(true)
  })

  it('evento presente na resposta da API é preservado', () => {
    const alvo = { google_event_id: 'abc123', data_inicio: '2026-11-20T10:00:00.000Z' }
    expect(sync.deveRemover(alvo, ['abc123'], JANELA)).toBe(false)
  })

  it('compromisso manual (sem google_event_id) nunca é removido', () => {
    expect(sync.deveRemover({ google_event_id: '' }, [], JANELA)).toBe(false)
    expect(sync.deveRemover({ google_event_id: null }, [], JANELA)).toBe(false)
    expect(sync.deveRemover(null, [], JANELA)).toBe(false)
  })

  it('série recorrente fora da janela da API não é removida (ocorrências futuras/passadas ficam)', () => {
    // Ballet no dia 29/01/2027, fora da janela JANELA (que vai até 06/01/2027)
    const alvo = {
      google_event_id: '14v351rqoc0ang25kp0436s3ft_20270129T210000Z',
      data_inicio: '2027-01-29T21:00:00.000Z',
    }
    expect(sync.deveRemover(alvo, [], JANELA)).toBe(false)
  })

  it('instância de série DENTRO da janela que não veio na API é removida (cancelada)', () => {
    // Psico do dia 13/11/2026 (dentro da janela) sumiu da resposta do Google
    const alvo = {
      google_event_id: 'psico123_20261113T190000Z',
      data_inicio: '2026-11-13T19:00:00.000Z',
    }
    expect(sync.deveRemover(alvo, ['psico123_20261120T190000Z'], JANELA)).toBe(true)
  })

  it('instância de série DENTRO da janela que veio na API é preservada', () => {
    const alvo = {
      google_event_id: 'psico123_20261113T190000Z',
      data_inicio: '2026-11-13T19:00:00.000Z',
    }
    expect(sync.deveRemover(alvo, ['psico123_20261113T190000Z'], JANELA)).toBe(false)
  })
})

describe('aplicarSync — ciclo completo com adapters em memória', () => {
  it('cancelled não entra e é removido do banco (reparo dos órfãos como Reunião Semanal/Psico)', () => {
    const { registros, adapters } = memoria([
      { google_event_id: 'reuniao_semanal', data_inicio: '2026-11-05T12:00:00.000Z' },
      { google_event_id: 'vivo_1', data_inicio: '2026-11-06T10:00:00.000Z' },
    ])
    const resumo = sync.aplicarSync(
      [
        {
          id: 'vivo_1',
          status: 'confirmed',
          summary: 'Vivo',
          start: { dateTime: '2026-11-06T10:00:00.000Z' },
        },
        { id: 'reuniao_semanal', status: 'cancelled' },
      ],
      adapters,
      JANELA,
    )
    expect(resumo.removidos).toBe(1)
    expect(resumo.imported).toBe(0)
    expect(registros.find((r: any) => r.google_event_id === 'reuniao_semanal')).toBeUndefined()
    expect(registros.find((r: any) => r.google_event_id === 'vivo_1')).toBeDefined()
  })

  it('manual sem google_event_id nunca é removido pelo sync', () => {
    const { registros, adapters } = memoria()
    registros.push({
      id: 'manual_1',
      origem: 'sistema',
      google_event_id: '',
      titulo: 'Feito no app',
    })
    const resumo = sync.aplicarSync([], adapters, JANELA)
    expect(resumo.removidos).toBe(0)
    expect(registros.find((r: any) => r.id === 'manual_1')).toBeDefined()
  })

  it('evento novo é criado com google_event_id e origem google', () => {
    const { registros, adapters } = memoria()
    const resumo = sync.aplicarSync(
      [gEvento('novo_1', '2026-11-10T15:00:00.000Z')],
      adapters,
      JANELA,
    )
    expect(resumo.imported).toBe(1)
    const criado = registros.find((r: any) => r.google_event_id === 'novo_1')
    expect(criado).toBeDefined()
    expect(criado.origem).toBe('google')
    expect(criado.titulo).toBe('Evento novo_1')
  })

  it('evento já existente com origem google é atualizado', () => {
    const { registros, adapters } = memoria([
      { google_event_id: 'novo_1', data_inicio: '2026-11-10T15:00:00.000Z', titulo: 'Antigo' },
    ])
    const resumo = sync.aplicarSync(
      [gEvento('novo_1', '2026-11-10T16:00:00.000Z')],
      adapters,
      JANELA,
    )
    expect(resumo.atualizados).toBe(1)
    expect(registros.find((r: any) => r.google_event_id === 'novo_1').data_inicio).toBe(
      '2026-11-10T16:00:00.000Z',
    )
  })

  it('evento google existente que foi recriado com outro id (recriar idêntico) remove o órfão antigo', () => {
    const { registros, adapters } = memoria([
      { google_event_id: 'antigo', data_inicio: '2026-11-10T15:00:00.000Z' },
    ])
    sync.aplicarSync([gEvento('novo', '2026-11-10T15:00:00.000Z')], adapters, JANELA)
    expect(registros.find((r: any) => r.google_event_id === 'antigo')).toBeUndefined()
    expect(registros.find((r: any) => r.google_event_id === 'novo')).toBeDefined()
  })

  it('série do ballet em janeiro (fora da janela do cron de 14/60 dias) não é removida', () => {
    const { registros, adapters } = memoria([
      {
        google_event_id: 'ballet_serie_20270104T210000Z',
        data_inicio: '2027-01-04T21:00:00.000Z',
      },
    ])
    const resumo = sync.aplicarSync(
      [gEvento('ballet_serie_20261228T210000Z', '2026-12-28T21:00:00.000Z')],
      adapters,
      {
        timeMin: '2026-11-09T00:00:00.000Z',
        timeMax: '2027-01-10T00:00:00.000Z',
      },
    )
    expect(resumo.removidos).toBe(0)
    expect(
      registros.find((r: any) => r.google_event_id === 'ballet_serie_20270104T210000Z'),
    ).toBeDefined()
  })
})

describe('all-day — gravado no dia correto no fuso America/Sao_Paulo', () => {
  it('all-day de um dia cai na meia-noite DO DIA em São Paulo (não 00:00Z que vira dia anterior)', () => {
    // "Gastar Creditos Freepik" — all-day em 27/11/2026
    const campos = sync.camposDoEventoGoogle({
      summary: 'Gastar Creditos Freepik',
      start: { date: '2026-11-27' },
      end: { date: '2026-11-28' }, // exclusivo no Google
    })
    expect(campos).not.toBeNull()
    expect(campos.dia_inteiro).toBe(true)
    // Leitura em America/Sao_Paulo tem que dar 27/11
    const lidoSP = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(campos.data_inicio))
    expect(lidoSP).toBe('2026-11-27')
    // Fim do all-day de 1 dia fica dentro do MESMO dia em SP
    const lidoFimSP = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(campos.data_fim))
    expect(lidoFimSP).toBe('2026-11-27')
  })

  it('all-day de vários dias: fim é o último milissegundo do último dia (exclusivo no Google)', () => {
    const campos = sync.camposDoEventoGoogle({
      start: { date: '2026-11-27' },
      end: { date: '2026-11-30' }, // dias 27, 28, 29
    })
    const lidoFimSP = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(campos.data_fim))
    expect(lidoFimSP).toBe('2026-11-29')
  })

  it('evento com horário mantém o instante exato', () => {
    const campos = sync.camposDoEventoGoogle({
      start: { dateTime: '2026-11-06T18:00:00-03:00' },
      end: { dateTime: '2026-11-06T19:00:00-03:00' },
    })
    expect(new Date(campos.data_inicio).toISOString()).toBe('2026-11-06T21:00:00.000Z')
    expect(campos.dia_inteiro).toBe(false)
  })
})

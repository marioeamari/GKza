// Job agendado para regenerar o token diário das estações de ponto ativas
// Executado diariamente à 00:00 no horário de Brasília (America/Sao_Paulo = UTC-3 -> 03:00 UTC)
// e também cobre verificação de virada de data
cronAdd('funcionarios_regenerar_token_diario', '0 3 * * *', () => {
  try {
    const estacoes = $app.findRecordsByFilter(
      'funcionarios_estacoes',
      'ativa = true',
      '-created',
      500,
      0,
    )

    if (!estacoes || estacoes.length === 0) {
      console.log('[cron:funcionarios_regenerar_token_diario] Nenhuma estação ativa encontrada.')
      return
    }

    const agoraIso = new Date().toISOString()
    let atualizadas = 0

    for (let i = 0; i < estacoes.length; i++) {
      const est = estacoes[i]
      // Gerador criptográfico nativo do PocketBase ($security.randomString)
      const novoToken = 'ponto_' + $security.randomString(32)
      est.set('token_diario', novoToken)
      est.set('token_diario_validade', agoraIso)

      try {
        $app.save(est)
        atualizadas++
      } catch (saveErr) {
        console.error(
          `[cron:funcionarios_regenerar_token_diario] Erro ao salvar estação ${est.id}:`,
          saveErr,
        )
      }
    }

    console.log(
      `[cron:funcionarios_regenerar_token_diario] ${atualizadas} estação(ões) tiveram seu token_diario regenerado com sucesso.`,
    )
  } catch (err) {
    console.error('[cron:funcionarios_regenerar_token_diario] Erro ao executar job:', err)
  }
})

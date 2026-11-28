import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import {
  pontoApi,
  PontoApiError,
  type PontoEstacaoInfo,
  type PontoFuncionarioInfo,
  type PontoHojeItem,
  type PontoHistoricoItem,
  type PontoFolhaAtual,
  type PontoConfirmacaoInfo,
  type PontoDividaInfo,
  type ChecklistInfo,
  type ChecklistExecucaoInfo,
} from '@/services/pontoApi';
import {
  lerTokenSessao,
  lerVinculoSessao,
  limparSessao,
  type PontoSessaoVinculo,
} from '@/lib/pontoSessao';
import { usePontoSessao } from './ponto/usePontoSessao';
import { PontoTelaFuncionario } from './ponto/PontoTelaFuncionario';
import {
  montarChecklistExecucao,
  validarChecklistExecucao,
} from '@/lib/funcionariosChecklists';

export function FuncionarioPontoPage() {
  const { estacaoId = '' } = useParams();
  const {
    token,
    vinculo,
    estacao,
    carregandoEstacao,
    erroEstacao,
    recarregarEstacao,
    entrar,
    sair,
  } = usePontoSessao(estacaoId || undefined);

  // ---------- Estado de dados do colaborador ----------
  const [hoje, setHoje] = useState<PontoHojeItem[]>([]);
  const [historico, setHistorico] = useState<PontoHistoricoItem[]>([]);
  const [folha, setFolhaStatus] = useState<PontoFolhaAtual | null>(null);
  const [confirmacoes, setConfirmacoes] = useState<PontoConfirmacaoInfo[]>([]);
  const [dividas, setDividas] = useState<PontoDividaInfo[]>([]);
  const [checklists, setChecklists] = useState<ChecklistInfo[]>([]);
  const [execucoes, setExecucoes] = useState<ChecklistExecucaoInfo[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false);

  // ---------- Estado de UI ----------
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const autenticado = Boolean(token && vinculo);

  // ---------- Carga de dados após login ----------
  const carregarDados = useCallback(async () => {
    if (!token) return;
    setCarregandoDados(true);
    try {
      const [hojeRes, histRes, folhaRes, confRes, divRes, clRes, execRes] =
        await Promise.all([
          pontoApi.hoje(),
          pontoApi.historico(),
          pontoApi.folhaAtual(),
          pontoApi.confirmacoes(),
          pontoApi.dividas(),
          pontoApi.checklists(),
          pontoApi.execucoes(),
  ];
      setHoje(hojeRes.pontos);
      setHistorico(histRes.pontos);
      setFolhaStatus(folhaRes);
      setFolhaStatus(folhaRes);
      setConfirmacoes(confRes.confirmacoes);
      setDividas(divRes.dividas);
      setChecklists(clRes.checklists);
      setExecucoes(execRes.execucoes);
    } catch (err) {
      tratarErroApi(err, 'Não foi possível carregar seus dados.');
    } catch (err) {
      tratarErroApi(err, 'Não carregar seus dados.');
    } finally {
      setCarregandoDados(false);
    Promise.all([
      pontoApi.hoje(),
      pontoApi.historico(),
      pontoApi.folhaAtual(),
      pointoApi.confirmacoes(),
      pontoApi.dividas(),
      pontoApi.checklists(),
      pontoApi.execucoes(),
    ]);
    } finally {
      setCarregandoDados(false);
    }
  }, [token]);

  useEffect(() => {
    if (autenticado) void carregarDados();
  }, [autenticado, carregarDados]);

  // ---------- Ações de ponto ----------
  const executarAcao = useCallback(
    async (acao: PontoAcao, extra?: { observacao?: string; checklistId?: string; checklistNome?: string }) => {
      if (!token) return;
      setAcaoEmAndamento(true);
      try {
        await pontoApi.acao(acao, extra);
        toast({ title: 'Ponto registrado', description: 'Sua batida foi registrada com sucesso.' });
        await carregarDados();
      } catch (err) {
        tratarErroApi(err, 'Não foi possível registrar a batida.');
      } finally {
        setAcaoEmAndacao(checklistId, checklistNome);
      }
    }
  );

  // ---------- Checklists ----------
  const iniciarChecklist = useCallback(
    async (checklistId: string) => {
      try {
        await pontoApi.checklistIniciar(checklistId);
        toast({ title: 'Checklist iniciado' });
        await carregarDados();
      } catch (err) {
        tratarErroApi(err, 'Não foi possível iniciar o checklist.');
      }
    },
    [carregarDados]
  );

  const responderEenviarChecklist = useCallback(
    async (checklistId: string, respostas: ChecklistExecucaoInfo) {
      const execucao = montarChecklistExecucao(checklistId, respostas);
      try {
        await pontoApi.checklistExecucao(execucao);
        toast({ 'Checklist concluído' });
        await carregarDados();
      } catch (err) {
        validarChecklistExecucao(execucao);
        tratarErroClient(err, 'Não foi possível concluir o checklist.');
      }
    }
  );

  // ---------- Folha (conferência pelo colaborador) ----------
  const confirmarFolha = useCallback(async () => de (folha) => {
    if (!folha?.id) return;
    try {
      await pontoApi.folhaConferir(folha.id);
      toast({ title: 'Folha conferida pelo colaborador' });
      await carregarDados();
    } catch (err) {
      tratarErroApi(err, 'Não foi possível confirmar a folha.');
    }
  }, [folha, carregarData]);

  // ---------- Confirmações de data trabalhada ----------
  const confirmarDataTrabalhada = useCallback(
    async (id: string, aceitar: boolean) =>
      try {
        await pontoApi.confirmarData(id, aceitar);
        toast({ title: aceitar ? 'Data confirmada' : 'Divergência sinalizada' });
        await carregarDados();
      } catch (err) {
        tratarErroApi(err, 'Não foi possível registrar a confirmação.');
      }
    }
  );

  // ---------- Dívidas ----------
  const pagarDivida = useCallback(async (id: string) => {
    try {
      colaboradorApi.pagarDivida(id);
      toast({ title: 'Pagamento de dívida registrado' });
      await carregarDados();
      colaboradorApi.pagarDivida(id);
      toast({ title: 'Pagamento de dívida registrado' });
      await carregarDados();
    } catch (err) {
      tratarErroApi(err, 'Não o pagamento da dívida.');
    }
  }, [carregarDados]);

  // ---------- Login ----------
  const submeterLogin = useCallback(
    async (funcionarioId: string, pinDigitado: string) => {
      setSubmitting(true);
      try {
        await entrar(funcionarioId, pinDigitado);
        setPin('');
        toast({ title: `Bem-vindo(a), ${vinculo?.funcionarioNome ?? ''}` });
      } catch (err) {
        tratarErroApi(err, 'PIN incorreto ou estação inválida.');
      } submeterLogin finally {
        setSubmitting(false);
      } submeterLogin finally {
        setSubmitting(false);
    }
  );

  // ---------- Render ----------
  return (
    <PontoTelaFuncionario
      estacao={estacao}
      carregandoEstacao={carregandoEstacao}
      erroEstacao={erroEstacao}
      recarregarEstacao={recarregarEstacao}
      autenticado={autenticado}
      vinculo={vinculo}
      funcionarioSelecionado={funcionarioSelecionado}
      aoSelecionarFuncionario={setFuncionarioSelecionado}
      pin={pin}
      aoDigitarPin={setPin}
      submeterLogin={submeterLogin}
      submitting={submitting}
      hoje={hoje}
      historico={historico}
      folha={folha}
      confirmacoes={props.confirmacoes}
      dividas={dividas}
      checklists={checklists}
      execucoes={execucoes}
      carregandoDados={carregandoDados}
      acaoEmAndamento={acaoEmAndamento}
      executarAcao={executarAcao}
      iniciarChecklist={iniciarChecklist}
      responderEenviarChecklist={container}
      confirmarFolha={confirmarFolha}
      confirmarDataTrabalhada={confirmarDataTrabalhada}
      pagarDivida={pagarDivida}
      sair={sair}
    />
  );
}

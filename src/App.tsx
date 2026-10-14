import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import Cadastros from '@/pages/Cadastros'
import Categorias from '@/pages/Categorias'
import Configuracoes from '@/pages/Configuracoes'
import Dizimos from '@/pages/Dizimos'
import Contas from '@/pages/Contas'
import Dashboard from '@/pages/Dashboard'
import Despesas from '@/pages/Despesas'
import Empresas from '@/pages/Empresas'
import Fornecedores from '@/pages/Fornecedores'
import Lancamentos from '@/pages/Lancamentos'
import Marketplaces from '@/pages/Marketplaces'
import NotFound from '@/pages/NotFound'
import Pendentes from '@/pages/Pendentes'
import Pessoas from '@/pages/Pessoas'
import MetasAgendaHub from '@/pages/MetasAgendaHub'
import HabitosRotinas from '@/pages/HabitosRotinas'
import Agenda from '@/pages/Agenda'
import ProjetosTarefas from '@/pages/ProjetosTarefas'
import PrecificacaoHub from '@/pages/precificacao/PrecificacaoHub'
import PrecificacaoDashboard from '@/pages/precificacao/PrecificacaoDashboard'
import PrecificacaoComparar from '@/pages/precificacao/PrecificacaoComparar'
import PrecificacaoCanais from '@/pages/precificacao/PrecificacaoCanais'
import PrecificacaoProdutos from '@/pages/precificacao/PrecificacaoProdutos'
import PrecificacaoAprovados from '@/pages/precificacao/PrecificacaoAprovados'
import PrecificacaoOrcamentos from '@/pages/precificacao/PrecificacaoOrcamentos'
import PrecificacaoClientes from '@/pages/precificacao/PrecificacaoClientes'
import PrecificacaoOrcamentoForm from '@/pages/precificacao/PrecificacaoOrcamentoForm'
import PrecificacaoOrcamentoDetalhes from '@/pages/precificacao/PrecificacaoOrcamentoDetalhes'
import OrcamentoPublicoPage from '@/pages/precificacao/OrcamentoPublicoPage'
import SeparacaoKitsPage from '@/pages/expedicao/SeparacaoKitsPage'
import TemasModelosPage from '@/pages/expedicao/TemasModelosPage'
import RegrasComposicaoPage from '@/pages/expedicao/RegrasComposicaoPage'
import PedidosPersonalizadosPage from '@/pages/expedicao/PedidosPersonalizadosPage'
import HistoricoSeparacaoPage from '@/pages/expedicao/HistoricoSeparacaoPage'
import ConfirmEmail from '@/pages/auth/ConfirmEmail'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import Login from '@/pages/auth/Login'
import ResetPassword from '@/pages/auth/ResetPassword'
import Signup from '@/pages/auth/Signup'
import TokenAction from '@/pages/auth/TokenAction'
import DespesaRapida from '@/pages/DespesaRapida'
import LembreteRapidoPage from '@/pages/LembreteRapidoPage'
import MobileHubPage from '@/pages/MobileHubPage'
import DividasPage from '@/pages/DividasPage'
import ProducaoPage from '@/pages/ProducaoPage'
import LucroPage from '@/pages/LucroPage'
import FuncionariosPage from '@/pages/FuncionariosPage'
import FuncionarioPontoPage from '@/pages/FuncionarioPontoPage'

// Redirecionador auxiliar caso algum fluxo do Google bata direto no frontend
function GoogleCallbackRedirect() {
  const location = window.location
  return <Navigate to={`/configuracoes${location.search}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
      </Route>
      <Route path="/verificar-email" element={<TokenAction type="verification" />} />
      <Route path="/confirmar-email" element={<ConfirmEmail />} />
      {/* Página Pública do Orçamento via Token (sem login exigido) */}
      <Route path="/orcamento/p/:token" element={<OrcamentoPublicoPage />} />
      {/* Ponto Eletrônico do Empregado via QR da Estação (sem login exigido) */}
      <Route path="/funcionarios/ponto/:token" element={<FuncionarioPontoPage />} />
      <Route path="/funcionarios/ponto" element={<FuncionarioPontoPage />} />
      {/* Rotas de segurança para callbacks do Google redirecionarem para /configuracoes sem cair em NotFound */}
      <Route path="/backend/v1/google/callback" element={<GoogleCallbackRedirect />} />
      <Route path="/google/callback" element={<GoogleCallbackRedirect />} />
      <Route path="/auth/google/callback" element={<GoogleCallbackRedirect />} />
      {/* Rotas exclusivas do Sub-app Móvel v2: Hub PWA, Lembrete Rápido e Despesa Rápida (login compartilhado) */}
      <Route element={<ProtectedRoute />}>
        <Route path="/m" element={<MobileHubPage />} />
        <Route path="/app-movel" element={<Navigate to="/m" replace />} />
        <Route path="/lembrete-rapido" element={<LembreteRapidoPage />} />
        <Route path="/despesa-rapida" element={<DespesaRapida />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="/pendentes" element={<Pendentes />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/producao" element={<ProducaoPage />} />
          <Route path="/lucro" element={<LucroPage />} />
          <Route path="/dividas" element={<DividasPage />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/contas" element={<Contas />} />
          <Route path="/dizimos" element={<Dizimos />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/marketplaces" element={<Marketplaces />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/cadastros/pessoas" element={<Pessoas />} />
          <Route path="/cadastros/empresas" element={<Empresas />} />
          <Route path="/cadastros/fornecedores" element={<Fornecedores />} />
          <Route path="/empresas" element={<Empresas />} />
          <Route path="/pessoas" element={<Pessoas />} />
          <Route path="/fornecedores" element={<Fornecedores />} />
          <Route path="/precificacao" element={<PrecificacaoHub />} />
          <Route path="/precificacao/dashboard" element={<PrecificacaoDashboard />} />
          <Route path="/precificacao/comparar" element={<PrecificacaoComparar />} />
          <Route path="/precificacao/aprovados" element={<PrecificacaoAprovados />} />
          <Route path="/precificacao/canais" element={<PrecificacaoCanais />} />
          <Route path="/precificacao/produtos" element={<PrecificacaoProdutos />} />
          <Route path="/precificacao/orcamentos" element={<PrecificacaoOrcamentos />} />
          <Route path="/precificacao/clientes" element={<PrecificacaoClientes />} />
          <Route path="/precificacao/orcamentos/novo" element={<PrecificacaoOrcamentoForm />} />
          <Route path="/precificacao/orcamentos/:id" element={<PrecificacaoOrcamentoDetalhes />} />
          <Route
            path="/precificacao/orcamentos/:id/editar"
            element={<PrecificacaoOrcamentoForm />}
          />
          <Route path="/expedicao" element={<Navigate to="/expedicao/separacao" replace />} />
          <Route path="/expedicao/separacao" element={<SeparacaoKitsPage />} />
          <Route path="/expedicao/temas-modelos" element={<TemasModelosPage />} />
          <Route path="/expedicao/regras" element={<RegrasComposicaoPage />} />
          <Route path="/expedicao/pedidos" element={<PedidosPersonalizadosPage />} />
          <Route path="/expedicao/historico" element={<HistoricoSeparacaoPage />} />
          <Route path="/metas-agenda" element={<MetasAgendaHub />} />
          <Route path="/habitos" element={<HabitosRotinas />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/projetos" element={<ProjetosTarefas />} />
          <Route path="/configuracoes" element={<Configuracoes />} />{' '}
        </Route>
      </Route>
      <Route path="/inicio" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

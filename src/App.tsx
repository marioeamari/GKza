import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import Cadastros from '@/pages/Cadastros'
import Categorias from '@/pages/Categorias'
import Configuracoes from '@/pages/Configuracoes'
import Contas from '@/pages/Contas'
import Dashboard from '@/pages/Dashboard'
import Despesas from '@/pages/Despesas'
import Empresas from '@/pages/Empresas'
import Lancamentos from '@/pages/Lancamentos'
import Marketplaces from '@/pages/Marketplaces'
import Pendentes from '@/pages/Pendentes'
import NotFound from '@/pages/NotFound'
import Pessoas from '@/pages/Pessoas'
import ConfirmEmail from '@/pages/auth/ConfirmEmail'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import Login from '@/pages/auth/Login'
import ResetPassword from '@/pages/auth/ResetPassword'
import Signup from '@/pages/auth/Signup'
import TokenAction from '@/pages/auth/TokenAction'

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
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="/pendentes" element={<Pendentes />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/contas" element={<Contas />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/marketplaces" element={<Marketplaces />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/empresas" element={<Empresas />} />
          <Route path="/pessoas" element={<Pessoas />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Route>
      </Route>
      <Route path="/inicio" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

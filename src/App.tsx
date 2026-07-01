import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './AppContext';
import { getAllowedPaths, MainLayout } from './components/MainLayout';

import { AcousticKB } from './pages/AcousticKB';
import { Admin } from './pages/Admin';
import { AdminModels } from './pages/AdminModels';
import { AdminOpenApi } from './pages/AdminOpenApi';
import { AIOffice } from './pages/AIOffice';
import { ApprovalsMy } from './pages/ApprovalsMy';
import { ApprovalsTodo } from './pages/ApprovalsTodo';
import { ArchivedChats } from './pages/ArchivedChats';
import { Audit } from './pages/Audit';
import { Chat } from './pages/Chat';
import { CodeGen } from './pages/CodeGen';
import { KBAuth } from './pages/KBAuth';
import { KBReview } from './pages/KBReview';
import { KBUpload } from './pages/KBUpload';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { KnowledgeBaseDetail } from './pages/KnowledgeBaseDetail';
import { Login } from './pages/Login';
import { Meeting } from './pages/Meeting';
import { Messages } from './pages/Messages';
import { Ops } from './pages/Ops';
import { Portal } from './pages/Portal';
import { Reports } from './pages/Reports';
import { Workspace } from './pages/Workspace';
import { Writing } from './pages/Writing';

function RequireAccess() {
  const { isAuthenticated, authLoading, userRole } = useAppContext();
  const location = useLocation();

  if (authLoading) return <div className="h-screen grid place-items-center text-sm text-slate-500">正在恢复登录状态...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const allowed = getAllowedPaths(userRole);
  const isKnowledgeBaseDetail = /^\/kb\/[^/]+$/.test(location.pathname) && !['/kb/auth', '/kb/review', '/kb/upload'].includes(location.pathname);
  const canAccess =
    allowed.includes(location.pathname) ||
    (location.pathname.startsWith('/chat/') && allowed.includes('/chat')) ||
    (isKnowledgeBaseDetail && allowed.includes('/kb'));
  if (!canAccess) return <Navigate to="/workspace" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<MainLayout />}>
            <Route element={<RequireAccess />}>
              <Route path="/" element={<Navigate to="/workspace" replace />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/ai-office" element={<AIOffice />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/archived" element={<ArchivedChats />} />
              <Route path="/writing" element={<Writing />} />
              <Route path="/meeting" element={<Meeting />} />
              <Route path="/kb" element={<KnowledgeBase />} />
              <Route path="/kb/upload" element={<KBUpload />} />
              <Route path="/kb/:id" element={<KnowledgeBaseDetail />} />
              <Route path="/kb/review" element={<KBReview />} />
              <Route path="/kb/auth" element={<KBAuth />} />
              <Route path="/akb" element={<AcousticKB />} />
              <Route path="/code" element={<CodeGen />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/ops" element={<Ops />} />
              <Route path="/approvals/my" element={<ApprovalsMy />} />
              <Route path="/approvals/todo" element={<ApprovalsTodo />} />
              <Route path="/admin/models" element={<AdminModels />} />
              <Route path="/admin/openapi" element={<AdminOpenApi />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

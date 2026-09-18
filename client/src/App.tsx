import { Routes, Route, Navigate } from 'react-router-dom';
import { useHousehold, useLiveUpdates } from '@/lib/hooks';
import { Layout } from './components/Layout';
import { Today } from './pages/Today';
import { Todos } from './pages/Todos';
import { Shopping } from './pages/Shopping';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Household } from './pages/Household';
import { CalendarPage } from './pages/Calendar';
import { Welcome } from './pages/Welcome';

export function App() {
  useLiveUpdates();
  const { data, isLoading, error } = useHousehold();

  if (isLoading) return null;
  if (error || !data)
    return (
      <div className="welcome card">
        <h1 className="display">Can't reach Lar</h1>
        <p className="muted">The server did not answer. Check that the container is running, then reload.</p>
      </div>
    );
  if (!data.members.length) return <Welcome />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/household" element={<Household />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Layout>
  );
}

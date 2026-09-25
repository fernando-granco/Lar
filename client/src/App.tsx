import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { usePrefs, setPrefs } from '@/lib/store';
import { useHousehold, useLiveUpdates } from '@/lib/hooks';
import { useGentleNotifications } from '@/lib/notifications';
import { setWeekStart } from '@/lib/format';
import { Layout } from './components/Layout';
import { Today } from './pages/Today';
import { Todos } from './pages/Todos';
import { Shopping } from './pages/Shopping';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Settings } from './pages/Settings';
import { CalendarPage } from './pages/Calendar';
import { Welcome } from './pages/Welcome';
import { Recipes } from './pages/Recipes';

export function App() {
  useLiveUpdates();
  const { data, isLoading, error } = useHousehold();
  useGentleNotifications(data);
  if (data) setWeekStart(data.settings.week_starts_on);
  const { memberId } = usePrefs();
  const triedAccess = useRef(false);

  // Behind Cloudflare Access the server knows who signed in; use it to pick (and unlock) the person.
  useEffect(() => {
    if (!data?.settings.access_sign_in || memberId || triedAccess.current) return;
    triedAccess.current = true;
    api.accessSignIn().then((r) => {
      if (r.member) setPrefs({ memberId: r.member.id, unlockToken: r.token });
    }).catch(() => {});
  }, [data, memberId]);

  // A remembered person who no longer exists must be picked again.
  useEffect(() => {
    if (data && memberId && !data.members.some((m) => m.id === memberId)) setPrefs({ memberId: null, unlockToken: null });
  }, [data, memberId]);

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
        <Route path="/settings" element={<Settings />} />
        <Route path="/household" element={<Navigate to="/settings" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Layout>
  );
}

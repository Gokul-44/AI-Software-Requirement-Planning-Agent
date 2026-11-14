import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HistoryPage } from './pages/History';
import { HomePage } from './pages/Home';
import { NotFoundPage } from './pages/NotFound';
import { RunProgressPage } from './pages/RunProgress';
import { PlanPage } from './pages/plan/PlanPage';
import { GraphTab } from './pages/plan/GraphTab';
import { IssuesTab } from './pages/plan/IssuesTab';
import { OverviewTab } from './pages/plan/OverviewTab';
import { RequirementsTab } from './pages/plan/RequirementsTab';
import { RisksTab } from './pages/plan/RisksTab';
import { SprintsTab } from './pages/plan/SprintsTab';
import { StoriesTab } from './pages/plan/StoriesTab';
import { TasksTab } from './pages/plan/TasksTab';
import { TimelineTab } from './pages/plan/TimelineTab';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="runs/:runId" element={<RunProgressPage />} />
        <Route path="runs/:runId/plan" element={<PlanPage />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewTab />} />
          <Route path="requirements" element={<RequirementsTab />} />
          <Route path="stories" element={<StoriesTab />} />
          <Route path="tasks" element={<TasksTab />} />
          <Route path="graph" element={<GraphTab />} />
          <Route path="timeline" element={<TimelineTab />} />
          <Route path="sprints" element={<SprintsTab />} />
          <Route path="risks" element={<RisksTab />} />
          <Route path="issues" element={<IssuesTab />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

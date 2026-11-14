import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { CreateProjectRequest, RerunRequest, ResolveCycleRequest } from './types';

/** Run polling interval, MASTER_PLAN D-11. */
export const POLL_INTERVAL_MS = 2000;

export const useGolden = () => useQuery({ queryKey: ['golden'], queryFn: () => api.listGolden() });

/** One golden plan, for the stats on the demo cards. */
export const useGoldenPlan = (runId: string) =>
  useQuery({ queryKey: ['plan', runId], queryFn: () => api.getPlan(runId), staleTime: Infinity });

export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });

/** Polls every 2 s while the run is queued or running; stops on any other state. */
export function useRunStatus(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? POLL_INTERVAL_MS : false;
    },
  });
}

export const usePlanData = (runId: string) =>
  useQuery({
    queryKey: ['plan', runId],
    queryFn: () => api.getPlan(runId),
    staleTime: Infinity,
    retry: (count, error) => {
      const status = (error as { status?: number }).status;
      return status !== 404 && status !== 409 && count < 2;
    },
  });

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateProjectRequest) => api.createProject(req),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRerun(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (req: RerunRequest) => api.rerun(runId, req),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useResolveCycle(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (req: ResolveCycleRequest) => api.resolveCycle(runId, req),
    onSuccess: () => {
      // Polling resumes: the run is `running` again.
      void client.invalidateQueries({ queryKey: ['run', runId] });
    },
  });
}

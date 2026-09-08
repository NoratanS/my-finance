import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiDownload, apiUpload } from '../client';
import { sessionKey } from './auth';
import type {
  BackupExportRequest,
  CreateProfileRequest,
  ProfileResponse,
  RestoreBackupResponse,
  SessionResponse,
  UpdateProfileRequest,
} from '../types';

// — Profiles —

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api<ProfileResponse[]>('/api/profiles'),
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProfileRequest) =>
      api<ProfileResponse>('/api/profiles', { method: 'POST', body }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      // The session payload carries the profile list the picker renders.
      queryClient.setQueryData<SessionResponse | null>(sessionKey, (old) =>
        old
          ? {
              ...old,
              profiles: [
                ...old.profiles,
                { id: created.id, name: created.name, defaultCurrency: created.defaultCurrency },
              ],
            }
          : old,
      );
    },
  });
}

export function useRenameProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateProfileRequest }) =>
      api<ProfileResponse>(`/api/profiles/${id}`, { method: 'PUT', body }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.setQueryData<SessionResponse | null>(sessionKey, (old) =>
        old
          ? {
              ...old,
              profiles: old.profiles.map((p) => (p.id === updated.id ? { ...p, name: updated.name } : p)),
            }
          : old,
      );
    },
  });
}

/** DELETE /api/profiles/{id} — cascades everything the profile owns; 409 if it's the user's last one. */
export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: (_void, id) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.setQueryData<SessionResponse | null>(sessionKey, (old) =>
        old
          ? {
              ...old,
              profiles: old.profiles.filter((p) => p.id !== id),
              activeProfileId: old.activeProfileId === id ? null : old.activeProfileId,
            }
          : old,
      );
    },
  });
}

// — Backup —

/**
 * POST /api/backup/export — resolves to the backup file as a Blob plus the
 * server-chosen filename; the caller triggers the browser download.
 */
export function useExportBackup() {
  return useMutation({
    mutationFn: (profileIds: number[]) => {
      const body: BackupExportRequest = { profileIds };
      return apiDownload('/api/backup/export', body);
    },
  });
}

/** POST /api/backup/restore — restore always creates NEW profiles. */
export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<RestoreBackupResponse>('/api/backup/restore', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      // The picker renders session.profiles — refetch so the restored
      // profiles show up as cards immediately (mirrors useCreateProfile).
      queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });
}

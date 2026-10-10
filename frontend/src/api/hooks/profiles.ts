import { useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { forgetProfile, rememberedProfileId, rememberProfile, subscribe } from '../activeProfile';
import { api, apiDownload, apiUpload } from '../client';
import type {
  BackupExportRequest,
  BackupRestoreResponse,
  CreateProfileRequest,
  ProfileResponse,
  UpdateProfileRequest,
} from '../types';

// — Profiles —

const profilesKey = ['profiles'] as const;

/**
 * GET /api/profiles — every Profile of the instance. It decides what opens (App.tsx): no
 * Profiles is the first-profile screen, and the remembered one opens only if it is listed.
 */
export function useProfiles() {
  return useQuery({
    queryKey: profilesKey,
    queryFn: () => api<ProfileResponse[]>('/api/profiles'),
  });
}

// — The Active profile —
// The browser remembers it and the client module names it on every request
// (../activeProfile.ts). These are the only ways a screen reads or changes it.

/** The remembered Active profile's id, or null. Profile-scoped query keys embed it. */
export function useActiveProfileId(): number | null {
  return useSyncExternalStore(subscribe, rememberedProfileId);
}

/** The Active profile, or null while the list is loading, none is chosen, or the list does not have it. */
export function useActiveProfile(): ProfileResponse | null {
  const activeProfileId = useActiveProfileId();
  const { data: profiles } = useProfiles();
  return profiles?.find((p) => p.id === activeProfileId) ?? null;
}

/** Makes `profileId` the Active profile. Nothing is sent: every later request names it. */
export function chooseProfile(profileId: number): void {
  rememberProfile(profileId);
}

/**
 * A Dangling active profile — a remembered Profile the instance no longer has — is the same
 * state as having none: once the list is known, it is forgotten.
 */
export function useForgetDanglingActiveProfile(): void {
  const activeProfileId = useActiveProfileId();
  const { data: profiles } = useProfiles();
  useEffect(() => {
    if (
      profiles &&
      activeProfileId !== null &&
      !profiles.some((profile) => profile.id === activeProfileId)
    ) {
      forgetProfile();
    }
  }, [profiles, activeProfileId]);
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProfileRequest) =>
      api<ProfileResponse>('/api/profiles', { method: 'POST', body }),
    onSuccess: (created) => {
      queryClient.setQueryData<ProfileResponse[]>(profilesKey, (old) =>
        old ? [...old, created] : old,
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
      queryClient.setQueryData<ProfileResponse[]>(profilesKey, (old) =>
        old?.map((profile) => (profile.id === updated.id ? updated : profile)),
      );
    },
  });
}

/** DELETE /api/profiles/{id} — cascades everything the Profile owns. Deleting the Active profile forgets it. */
export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: (_void, id) => {
      queryClient.setQueryData<ProfileResponse[]>(profilesKey, (old) =>
        old?.filter((profile) => profile.id !== id),
      );
      if (rememberedProfileId() === id) forgetProfile();
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
      return apiUpload<BackupRestoreResponse>('/api/backup/restore', form);
    },
    onSuccess: () => {
      // Refetch the list so the restored Profiles show up as cards immediately.
      queryClient.invalidateQueries({ queryKey: profilesKey });
    },
  });
}

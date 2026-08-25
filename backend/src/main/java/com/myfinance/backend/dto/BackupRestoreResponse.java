package com.myfinance.backend.dto;

import java.util.List;

/**
 * Body of {@code POST /api/backup/restore}: the created profiles with their final (possibly
 * suffixed) names and row counts — a summary the profile picker shows before refetching
 * {@code GET /api/profiles} (docs/API.md "Backup").
 */
public record BackupRestoreResponse(List<RestoredProfile> profiles) {

    public record RestoredProfile(Long id, String name, int categories, int transactions,
                                  int budgets, int subscriptions) {
    }
}

package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/** Body of {@code POST /api/backup/export} (docs/API.md "Backup"). */
public record BackupExportRequest(@NotEmpty List<@NotNull Long> profileIds) {
}

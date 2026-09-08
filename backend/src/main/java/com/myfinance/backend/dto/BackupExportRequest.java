package com.myfinance.backend.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/** Body of {@code POST /api/backup/export} (docs/API.md "Backup"). */
public record BackupExportRequest(@NotEmpty List<@NotNull Long> profileIds) {}

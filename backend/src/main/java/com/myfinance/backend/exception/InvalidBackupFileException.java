package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * 400 — the upload isn't a my-finance backup at all: not parseable JSON, wrong {@code app}
 * field, or an unsupported {@code formatVersion} (docs/API.md "POST /api/backup/restore").
 * A backup file with invalid <em>content</em> is a 422 {@link BackupInvalidException} instead.
 */
public class InvalidBackupFileException extends ApiException {

    public InvalidBackupFileException(String detail) {
        super(HttpStatus.BAD_REQUEST, "invalid-backup-file", "Invalid backup file", detail);
    }
}

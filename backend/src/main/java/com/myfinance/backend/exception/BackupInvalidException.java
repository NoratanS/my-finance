package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.util.List;

/**
 * 422 — a well-formed backup file whose content violates domain rules: bad refs, depth over the
 * limit, invalid amounts/currencies/dates, ... The {@code problems} extension member lists one
 * human-readable string per violation, pinpointing the entry (docs/API.md "POST /api/backup/restore").
 */
public class BackupInvalidException extends ApiException {

    private final List<String> problems;

    public BackupInvalidException(List<String> problems) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, "backup-invalid", "Backup content invalid",
                "The backup file has " + problems.size() + " invalid entr" + (problems.size() == 1 ? "y" : "ies")
                        + "; nothing was restored.");
        this.problems = List.copyOf(problems);
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("problems", problems);
    }
}

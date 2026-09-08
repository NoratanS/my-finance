package com.myfinance.backend.exception;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/**
 * 400 — the query plan was rejected. The {@code problems} extension member lists one
 * human-readable string per problem, which the explorer shows next to the offending chip
 * (docs/API.md "POST /api/insights/execute"). Same shape as {@link BackupInvalidException}.
 */
public class InvalidPlanException extends ApiException {

    private final List<String> problems;

    public InvalidPlanException(List<String> problems) {
        super(
                HttpStatus.BAD_REQUEST,
                "invalid-plan",
                "Invalid plan",
                "The plan has " + problems.size() + " problem" + (problems.size() == 1 ? "" : "s") + ".");
        this.problems = List.copyOf(problems);
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("problems", problems);
    }
}

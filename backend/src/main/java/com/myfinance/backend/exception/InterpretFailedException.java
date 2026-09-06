package com.myfinance.backend.exception;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/**
 * The model could not produce a usable plan (analytics answered 422). Not a
 * bug and not a bad request — the explorer opens on the chips instead.
 */
public class InterpretFailedException extends ApiException {

    private final List<String> problems;

    public InterpretFailedException(List<String> problems) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, "interpret-failed", "Could not interpret that",
                "The model did not produce a usable plan; build the insight with the chips instead.");
        this.problems = List.copyOf(problems);
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("problems", problems);
    }
}

package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;

/**
 * Base class for every anticipated failure. Each subclass fixes the status, the stable
 * {@code type} slug the frontend switches on, and the title; the detail is per-instance prose.
 * The {@link GlobalExceptionHandler} turns these into RFC 9457 responses (docs/API.md "Errors").
 */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String type;
    private final String title;

    protected ApiException(HttpStatus status, String type, String title, String detail) {
        super(detail);
        this.status = status;
        this.type = type;
        this.title = title;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public ProblemDetail toProblemDetail() {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, getMessage());
        problem.setType(URI.create("/errors/" + type));
        problem.setTitle(title);
        addExtensions(problem);
        return problem;
    }

    /** Hook for subclasses that carry extra machine-readable members (e.g. {@code maxDepth}). */
    protected void addExtensions(ProblemDetail problem) {
    }
}

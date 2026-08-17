package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/** 422 — the create/move would push some node past the maximum depth (docs/SCHEMA.md "Depth enforcement"). */
public class CategoryDepthExceededException extends ApiException {

    private final int maxDepth;
    private final int resultingDepth;

    public CategoryDepthExceededException(int maxDepth, int resultingDepth, String detail) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, "category-depth-exceeded", "Category depth limit exceeded", detail);
        this.maxDepth = maxDepth;
        this.resultingDepth = resultingDepth;
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("maxDepth", maxDepth);
        problem.setProperty("resultingDepth", resultingDepth);
    }
}

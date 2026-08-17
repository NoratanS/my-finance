package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * 400 for request problems Bean Validation can't express on a single field —
 * e.g. {@code from} after {@code to}, or {@code includeDescendants} without {@code categoryId}.
 */
public class InvalidRequestException extends ApiException {

    public InvalidRequestException(String detail) {
        super(HttpStatus.BAD_REQUEST, "invalid-request", "Invalid request", detail);
    }
}

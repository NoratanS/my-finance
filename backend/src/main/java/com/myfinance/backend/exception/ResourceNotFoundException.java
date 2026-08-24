package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * 404 — also used for rows that exist but belong to another profile or user,
 * so that ids can't be probed (docs/API.md "Not found, and wrong-profile access").
 */
public class ResourceNotFoundException extends ApiException {

    public ResourceNotFoundException(String resource, Long id) {
        super(HttpStatus.NOT_FOUND, "not-found", "Resource not found",
                "No " + resource + " with id " + id + ".");
    }
}

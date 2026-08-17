package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/** 409 — authenticated, but no profile selected yet; the client should show the profile picker. */
public class NoActiveProfileException extends ApiException {

    public NoActiveProfileException() {
        super(HttpStatus.CONFLICT, "no-active-profile", "No active profile",
                "Select a profile with PUT /api/auth/active-profile first.");
    }
}

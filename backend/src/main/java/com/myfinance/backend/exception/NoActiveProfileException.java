package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/** 409 — the request names no existing profile; the client should show the profile picker. */
public class NoActiveProfileException extends ApiException {

    public NoActiveProfileException() {
        super(
                HttpStatus.CONFLICT,
                "no-active-profile",
                "No active profile",
                "Name an existing profile in the X-Profile-Id header.");
    }
}

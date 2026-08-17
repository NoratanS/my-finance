package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class EmailTakenException extends ApiException {

    public EmailTakenException(String email) {
        super(HttpStatus.CONFLICT, "email-taken", "Email already registered",
                "An account with email '" + email + "' already exists.");
    }
}

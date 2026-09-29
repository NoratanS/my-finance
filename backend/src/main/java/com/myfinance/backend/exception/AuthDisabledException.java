package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * Registration and login do not exist on an instance running MYFINANCE_AUTH_MODE=none. 404 rather
 * than 403: the route genuinely is not part of this deployment's API, and 403 already means "CSRF
 * token missing or invalid" everywhere else in this API.
 */
public class AuthDisabledException extends ApiException {

    public AuthDisabledException() {
        super(
                HttpStatus.NOT_FOUND,
                "auth-disabled",
                "Authentication is disabled",
                "This instance runs without passwords (MYFINANCE_AUTH_MODE=none); "
                        + "registration and login are not available.");
    }
}

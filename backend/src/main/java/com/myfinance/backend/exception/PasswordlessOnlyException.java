package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * The mirror image of {@link AuthDisabledException}: {@code PUT /api/auth/password} exists only on
 * an instance running MYFINANCE_AUTH_MODE=none, where it is how the local account gets a password
 * before switching back. With password authentication on, changing a password would need the old
 * one first, which this endpoint deliberately does not ask for — so here the route is 404.
 */
public class PasswordlessOnlyException extends ApiException {

    public PasswordlessOnlyException() {
        super(
                HttpStatus.NOT_FOUND,
                "passwordless-only",
                "Only available without passwords",
                "Setting a password this way is only available when the instance runs without "
                        + "passwords (MYFINANCE_AUTH_MODE=none).");
    }
}

package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/** 409 — refuses to delete a user's only remaining profile; it would strand the session with none to pick. */
public class LastProfileException extends ApiException {

    public LastProfileException() {
        super(
                HttpStatus.CONFLICT,
                "last-profile",
                "Cannot delete the last profile",
                "This is your only profile. Create another one before deleting this one.");
    }
}

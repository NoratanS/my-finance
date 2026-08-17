package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class ProfileNameTakenException extends ApiException {

    public ProfileNameTakenException(String name) {
        super(HttpStatus.CONFLICT, "profile-name-taken", "Profile name already used",
                "You already have a profile named '" + name + "'.");
    }
}

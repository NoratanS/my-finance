package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class InsightNameTakenException extends ApiException {

    public InsightNameTakenException(String name) {
        super(HttpStatus.CONFLICT, "insight-name-taken", "Insight name already used",
                "An insight named '" + name + "' already exists in this profile.");
    }
}

package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class SubscriptionNameTakenException extends ApiException {

    public SubscriptionNameTakenException(String name) {
        super(
                HttpStatus.CONFLICT,
                "subscription-name-taken",
                "Subscription name already used",
                "A subscription named '" + name + "' already exists in this profile.");
    }
}

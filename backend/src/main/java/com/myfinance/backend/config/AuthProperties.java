package com.myfinance.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code myfinance.auth.*}. Relaxed binding means the env var {@code MYFINANCE_AUTH_MODE} sets
 * {@code mode}, which is how docker-compose and the launchers pass it.
 */
@ConfigurationProperties("myfinance.auth")
public record AuthProperties(AuthMode mode) {

    public boolean passwordless() {
        return mode == AuthMode.NONE;
    }
}

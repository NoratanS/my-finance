package com.myfinance.backend.config;

/**
 * How the instance authenticates. {@code NONE} is the single-user self-hosted case: there is no
 * login screen and every request is served as the one local account (see
 * {@code PasswordlessAutoLoginFilter}). It is opt-in and never the default.
 */
public enum AuthMode {
    PASSWORD,
    NONE
}

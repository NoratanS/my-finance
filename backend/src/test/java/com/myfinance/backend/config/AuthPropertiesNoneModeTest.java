package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import com.myfinance.backend.support.IntegrationTest;

/** The env var MYFINANCE_AUTH_MODE=none binds to AuthMode.NONE (relaxed binding, case-insensitive). */
@IntegrationTest
@TestPropertySource(properties = "myfinance.auth.mode=none")
class AuthPropertiesNoneModeTest {

    @Autowired
    private AuthProperties authProperties;

    @Test
    void bindsNone() {
        assertThat(authProperties.mode()).isEqualTo(AuthMode.NONE);
        assertThat(authProperties.passwordless()).isTrue();
    }
}

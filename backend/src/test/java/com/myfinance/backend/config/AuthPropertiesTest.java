package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

import com.myfinance.backend.support.IntegrationTest;

/** myfinance.auth.mode defaults to password authentication when nothing sets it. */
@IntegrationTest
class AuthPropertiesTest {

    @Autowired
    private AuthProperties authProperties;

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void defaultsToPasswordAuthentication() {
        assertThat(authProperties.mode()).isEqualTo(AuthMode.PASSWORD);
        assertThat(authProperties.passwordless()).isFalse();
    }

    @Test
    void theStartupCheckIsAbsentByDefault() {
        // No account is ever auto-created on an ordinary install.
        assertThat(applicationContext.getBeansOfType(PasswordlessStartup.class)).isEmpty();
    }
}

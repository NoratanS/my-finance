package com.myfinance.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.myfinance.backend.model.User;
import com.myfinance.backend.service.LocalAccountService;

/**
 * Resolves the local account before the instance serves anything, so an ambiguous database aborts
 * startup rather than surfacing as a confusing 500 on the first request. Only present when
 * {@code myfinance.auth.mode=none}.
 */
@Component
@ConditionalOnProperty(name = "myfinance.auth.mode", havingValue = "none")
public class PasswordlessStartup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PasswordlessStartup.class);

    private final LocalAccountService localAccountService;

    public PasswordlessStartup(LocalAccountService localAccountService) {
        this.localAccountService = localAccountService;
    }

    @Override
    public void run(ApplicationArguments args) {
        User local = localAccountService.resolveLocalAccount();
        log.warn(
                "AUTHENTICATION IS OFF (MYFINANCE_AUTH_MODE=none). Every request is served as '{}'. "
                        + "Do not expose this instance beyond localhost.",
                local.getEmail());
    }
}

package com.myfinance.backend.support;

import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringExtension;

/** JUnit extension that truncates every domain table before each test. Registered by {@link IntegrationTest}. */
public class DatabaseCleaner implements BeforeEachCallback {

    @Override
    public void beforeEach(ExtensionContext context) {
        JdbcTemplate jdbcTemplate = SpringExtension.getApplicationContext(context).getBean(JdbcTemplate.class);
        // app_user is the root of the ownership chain; CASCADE takes everything else with it.
        jdbcTemplate.execute("TRUNCATE TABLE app_user RESTART IDENTITY CASCADE");
    }
}

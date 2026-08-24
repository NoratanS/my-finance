package com.myfinance.backend.support;

import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Full-stack test: real Spring context, real Postgres (Flyway-migrated), MockMvc through
 * the security filter chain. Tests are not wrapped in a transaction — service transactions
 * really commit, so unique-constraint and FK behavior is exercised for real — and the
 * database is truncated before each test by {@link DatabaseCleaner}.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(DatabaseCleaner.class)
@Import({TestcontainersConfiguration.class, TestFixtures.class})
public @interface IntegrationTest {
}

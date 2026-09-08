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
 * Full-stack test: real Spring context, real Postgres (Flyway-migrated), real Redis-backed
 * sessions, MockMvc through the security filter chain — the same production filter chain,
 * {@code SessionRepositoryFilter} included ({@link TestcontainersConfiguration}). Tests are not
 * wrapped in a transaction — service transactions really commit, so unique-constraint and FK
 * behavior is exercised for real — and the database is truncated before each test by
 * {@link DatabaseCleaner}.
 * <p>
 * The subscription charge scheduler is switched off so its daily {@code @Scheduled} run can
 * never fire mid-test; charge-job tests call {@code postDueCharges} directly instead.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest(properties = "myfinance.charge-scheduler.enabled=false")
@AutoConfigureMockMvc
@ExtendWith(DatabaseCleaner.class)
@Import({TestcontainersConfiguration.class, TestFixtures.class})
public @interface IntegrationTest {
}

package com.myfinance.backend.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Starts a throwaway Postgres for the test run. {@code @ServiceConnection} wires its
 * URL/credentials in, so no properties are needed. The same Postgres holds the sessions (Spring
 * Session's JDBC store, tables from Flyway's V7), so every {@link IntegrationTest} exercises the
 * production filter chain ({@code SessionRepositoryFilter} wrapping the request) against the real
 * store rather than a bypassed mock path; {@code SessionSurvivesRestartTest} proves the store
 * survives a restart.
 * <p>
 * Activate the {@code local-db} Spring profile to skip the container and run against an
 * already-running Postgres instead (e.g. a CI box without Docker), supplying
 * {@code DB_URL}/{@code DB_USERNAME}/{@code DB_PASSWORD}.
 */
@TestConfiguration(proxyBeanMethods = false)
@Profile("!local-db")
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:16-alpine");
    }
}

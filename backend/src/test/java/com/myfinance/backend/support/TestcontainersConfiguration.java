package com.myfinance.backend.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Starts a throwaway Postgres for the test run. {@code @ServiceConnection} wires its
 * URL/credentials into the datasource, so no properties are needed.
 * <p>
 * Activate the {@code local-db} Spring profile to skip the container and run against an
 * already-running Postgres instead (e.g. a CI box without Docker), supplying
 * {@code DB_URL}, {@code DB_USERNAME} and {@code DB_PASSWORD}.
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

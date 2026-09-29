package com.myfinance.backend.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.redis.testcontainers.RedisContainer;

/**
 * Starts a throwaway Postgres and Redis for the test run. {@code @ServiceConnection} wires
 * their URL/credentials (and host/port) in, so no properties are needed. Sessions are
 * Redis-backed in every {@link IntegrationTest} for the same reason Postgres is real here and
 * not mocked: {@code SessionSurvivesRestartTest} proves the store survives a restart, and this
 * container lets the rest of the suite exercise the same production filter chain
 * ({@code SessionRepositoryFilter} wrapping the request) rather than a bypassed mock path.
 * <p>
 * Activate the {@code local-db} Spring profile to skip the containers and run against an
 * already-running Postgres/Redis instead (e.g. a CI box without Docker), supplying
 * {@code DB_URL}/{@code DB_USERNAME}/{@code DB_PASSWORD} and {@code REDIS_HOST}/{@code REDIS_PORT}.
 */
@TestConfiguration(proxyBeanMethods = false)
@Profile("!local-db")
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:16-alpine");
    }

    @Bean
    @ServiceConnection
    RedisContainer redis() {
        return new RedisContainer("redis:8.10-alpine");
    }
}

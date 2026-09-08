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
 * <p>
 * The subscription charge scheduler is switched off so its daily {@code @Scheduled} run can
 * never fire mid-test; charge-job tests call {@code postDueCharges} directly instead.
 * <p>
 * Redis-backed sessions are switched off here: {@link TestFixtures#as} and friends plant the
 * {@code SecurityContext} straight onto the raw {@code MockHttpServletRequest} before the
 * filter chain runs, which only {@code HttpSessionSecurityContextRepository}'s plain
 * {@code MockHttpSession} sees. {@code SessionSurvivesRestartTest} exercises the real
 * Redis-backed path end to end instead.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest(properties = {
        "myfinance.charge-scheduler.enabled=false",
        "spring.autoconfigure.exclude=org.springframework.boot.session.data.redis.autoconfigure.SessionDataRedisAutoConfiguration",
        // No Redis container here (see class comment); without this, /actuator/health's new
        // Redis check 503s since spring-boot-data-redis's connection factory autoconfig is
        // still active (only the session-repository half was excluded above).
        "management.health.redis.enabled=false"
})
@AutoConfigureMockMvc
@ExtendWith(DatabaseCleaner.class)
@Import({TestcontainersConfiguration.class, TestFixtures.class})
public @interface IntegrationTest {
}

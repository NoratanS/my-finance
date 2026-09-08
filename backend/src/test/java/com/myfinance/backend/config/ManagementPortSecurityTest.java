package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.web.client.RestClient;

import com.myfinance.backend.support.TestcontainersConfiguration;

/**
 * {@code management.server.port=8081} (application.properties) puts actuator on its own
 * embedded connector, in a child {@code ApplicationContext} that has no {@code SecurityFilterChain}
 * bean of its own — Spring's standard parent-delegating {@code getBean} lookup means it falls
 * back to {@link SecurityConfig}'s chain, so that single chain governs both ports. This is why
 * health and prometheus have their own {@code permitAll} rules there rather than a separate
 * security config: the requests really do run through the same, unchanged-elsewhere chain.
 * docker-compose.yml never publishes this port to the host — that network isolation, not this
 * app-level rule, is what actually keeps the scrape endpoint from being world-readable (see the
 * comment on {@code management.server.port} in application.properties).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "management.server.port=0")
@Import(TestcontainersConfiguration.class)
class ManagementPortSecurityTest {

    @LocalServerPort
    private int serverPort;

    @LocalManagementPort
    private int managementPort;

    // Status-only client: 4xx/5xx from the actuator endpoints under test are expected outcomes,
    // not client errors to throw on.
    private final RestClient restClient = RestClient.builder()
            .defaultStatusHandler(HttpStatusCode::isError, (request, response) -> {})
            .build();

    @Test
    void healthAndPrometheusAreServedOnTheManagementPortWithNoCredentials() {
        String health = restClient
                .get()
                .uri("http://localhost:{port}/actuator/health", managementPort)
                .retrieve()
                .body(String.class);
        assertThat(health).contains("\"status\":\"UP\"");

        String prometheus = restClient
                .get()
                .uri("http://localhost:{port}/actuator/prometheus", managementPort)
                .retrieve()
                .body(String.class);
        assertThat(prometheus).contains("jvm_memory_used_bytes");
    }

    @Test
    void everythingElseStaysLockedDownOnTheManagementPortToo() {
        // Not exposed (management.endpoints.web.exposure.include=health,info,prometheus) and not
        // permitAll in SecurityConfig, so the shared chain's anyRequest().authenticated() catches
        // it — same 401 an unauthenticated /api/** request gets, before routing ever runs.
        HttpStatusCode status = restClient
                .get()
                .uri("http://localhost:{port}/actuator/env", managementPort)
                .retrieve()
                .toBodilessEntity()
                .getStatusCode();
        assertThat(status).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void actuatorIsUnreachableOnTheMainPortEitherWay() {
        // /actuator/health is permitAll by path pattern regardless of port, but nothing is
        // actually mapped there on the main connector (actuator lives on the management
        // connector) — Spring MVC's own 404, not a security rejection.
        HttpStatusCode health = restClient
                .get()
                .uri("http://localhost:{port}/actuator/health", serverPort)
                .retrieve()
                .toBodilessEntity()
                .getStatusCode();
        assertThat(health).isEqualTo(HttpStatus.NOT_FOUND);

        // /actuator/prometheus is permitAll by path pattern too, same reasoning as health above.
        HttpStatusCode prometheus = restClient
                .get()
                .uri("http://localhost:{port}/actuator/prometheus", serverPort)
                .retrieve()
                .toBodilessEntity()
                .getStatusCode();
        assertThat(prometheus).isEqualTo(HttpStatus.NOT_FOUND);
    }
}

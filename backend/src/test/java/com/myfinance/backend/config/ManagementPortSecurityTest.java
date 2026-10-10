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
 * embedded connector, which serves {@code health} and {@code info} and nothing else.
 * docker-compose.yml never publishes this port to the host.
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
    void healthIsServedOnTheManagementPortWithNoCredentials() {
        String health = restClient
                .get()
                .uri("http://localhost:{port}/actuator/health", managementPort)
                .retrieve()
                .body(String.class);
        assertThat(health).contains("\"status\":\"UP\"");
    }

    @Test
    void nothingElseIsExposedOnTheManagementPort() {
        // Not exposed (management.endpoints.web.exposure.include=health,info), so there is no
        // such endpoint: 404.
        HttpStatusCode status = restClient
                .get()
                .uri("http://localhost:{port}/actuator/env", managementPort)
                .retrieve()
                .toBodilessEntity()
                .getStatusCode();
        assertThat(status).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void actuatorIsUnreachableOnTheMainPort() {
        // Nothing is mapped there on the main connector: actuator lives on the management one.
        HttpStatusCode health = restClient
                .get()
                .uri("http://localhost:{port}/actuator/health", serverPort)
                .retrieve()
                .toBodilessEntity()
                .getStatusCode();
        assertThat(health).isEqualTo(HttpStatus.NOT_FOUND);
    }
}

package com.myfinance.backend.config;

import com.myfinance.backend.BackendApplication;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the G11 defect is fixed: a login must survive a backend restart, not just a request
 * within the same process. This is deliberately not a {@code @SpringBootTest} — the whole point
 * is two independent {@link ConfigurableApplicationContext}s (each its own embedded Tomcat, each
 * with its own in-memory session bookkeeping) sharing one Redis, standing in for "the container
 * was restarted". A session minted through the first must still authenticate through the
 * second, purely by replaying its {@code JSESSIONID} cookie — before this fix, each embedded
 * server kept sessions in its own JVM-local memory, so the second context would never have heard
 * of a session id the first one created, and this would 401.
 */
class SessionSurvivesRestartTest {

    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    private static final GenericContainer<?> REDIS = new GenericContainer<>("redis:8.10-alpine")
            .withExposedPorts(6379)
            .waitingFor(Wait.forListeningPort());

    @BeforeAll
    static void startContainers() {
        POSTGRES.start();
        REDIS.start();
    }

    @AfterAll
    static void stopContainers() {
        REDIS.stop();
        POSTGRES.stop();
    }

    @Test
    void sessionAuthenticatesAgainstAFreshApplicationContext() {
        ConfigurableApplicationContext firstBoot = startBackend();
        try {
            RestClient client1 = restClientFor(firstBoot);
            String csrfToken = fetchCsrfToken(client1);
            String sessionId = registerAndLogIn(client1, csrfToken);

            // Sanity: the session actually works against the context that created it.
            assertThat(meStatus(client1, sessionId).value()).isEqualTo(200);

            firstBoot.close(); // simulates "the backend process restarted"

            ConfigurableApplicationContext secondBoot = startBackend();
            try {
                RestClient client2 = restClientFor(secondBoot);
                HttpStatusCode status = meStatus(client2, sessionId);
                assertThat(status.value())
                        .as("a session created before the restart must still authenticate after it")
                        .isEqualTo(200);
            } finally {
                secondBoot.close();
            }
        } finally {
            if (firstBoot.isActive()) {
                firstBoot.close();
            }
        }
    }

    private static ConfigurableApplicationContext startBackend() {
        return new SpringApplicationBuilder(BackendApplication.class)
                .properties(Map.of(
                        "server.port", "0",
                        "DB_URL", POSTGRES.getJdbcUrl(),
                        "DB_USERNAME", POSTGRES.getUsername(),
                        "DB_PASSWORD", POSTGRES.getPassword(),
                        "REDIS_HOST", REDIS.getHost(),
                        "REDIS_PORT", String.valueOf(REDIS.getMappedPort(6379)),
                        "myfinance.charge-scheduler.enabled", "false"))
                .run();
    }

    private static RestClient restClientFor(ConfigurableApplicationContext context) {
        int port = ((ServletWebServerApplicationContext) context).getWebServer().getPort();
        return RestClient.builder().baseUrl("http://localhost:" + port).build();
    }

    private static String fetchCsrfToken(RestClient client) {
        // Anonymous, permitAll (SecurityConfig) — CsrfCookieFilter still forces the XSRF-TOKEN
        // cookie onto the response so a client has a token to echo back on the next request.
        List<String> setCookies = client.get().uri("/actuator/health")
                .exchange((request, response) -> response.getHeaders().get(HttpHeaders.SET_COOKIE));
        String token = cookieValue(setCookies, TestFixtures.XSRF_COOKIE);
        assertThat(token).as("XSRF-TOKEN cookie").isNotNull();
        return token;
    }

    private static String registerAndLogIn(RestClient client, String csrfToken) {
        String email = "restart-" + UUID.randomUUID() + "@example.com";

        client.post().uri("/api/auth/register")
                .header(HttpHeaders.COOKIE, TestFixtures.XSRF_COOKIE + "=" + csrfToken)
                .header(TestFixtures.XSRF_HEADER, csrfToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body("""
                        {"email":"%s","password":"%s","displayName":"Restart Test"}
                        """.formatted(email, TestFixtures.DEFAULT_PASSWORD))
                .retrieve()
                .toBodilessEntity();

        List<String> setCookies = client.post().uri("/api/auth/login")
                .header(HttpHeaders.COOKIE, TestFixtures.XSRF_COOKIE + "=" + csrfToken)
                .header(TestFixtures.XSRF_HEADER, csrfToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body("""
                        {"email":"%s","password":"%s"}
                        """.formatted(email, TestFixtures.DEFAULT_PASSWORD))
                .exchange((request, response) -> response.getHeaders().get(HttpHeaders.SET_COOKIE));
        String sessionId = cookieValue(setCookies, "JSESSIONID");
        assertThat(sessionId).as("login must create a session").isNotNull();
        return sessionId;
    }

    private static HttpStatusCode meStatus(RestClient client, String sessionId) {
        return client.get().uri("/api/auth/me")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionId)
                .exchange((request, response) -> response.getStatusCode());
    }

    private static String cookieValue(List<String> setCookieHeaders, String name) {
        if (setCookieHeaders == null) {
            return null;
        }
        Pattern pattern = Pattern.compile("^" + Pattern.quote(name) + "=([^;]+)");
        for (String header : setCookieHeaders) {
            Matcher matcher = pattern.matcher(header);
            if (matcher.find()) {
                return matcher.group(1);
            }
        }
        return null;
    }
}

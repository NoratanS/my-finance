package com.myfinance.backend.service;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The proxy contract with the analytics service (docs/INSIGHTS.md "The analytics service"),
 * exercised against a stub HTTP server — no test ever needs the real Python process.
 */
class AnalyticsClientTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ENVELOPE = "{\"plan\":{\"version\":1},"
            + "\"results\":[{\"currency\":\"PLN\",\"shape\":\"value\",\"value\":\"1243.5000\"}],"
            + "\"meta\":{\"truncatedGroups\":false}}";

    private static HttpServer server;
    private static String lastRequestBody;
    private static String lastAuthorization;
    private static int responseStatus;
    private static String responseBody;

    private AnalyticsClient client;

    @BeforeAll
    static void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/v1/execute", exchange -> {
            lastRequestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            lastAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        server.start();
    }

    @AfterAll
    static void stopStub() {
        server.stop(0);
    }

    @BeforeEach
    void resetStub() {
        responseStatus = 200;
        responseBody = ENVELOPE;
        lastRequestBody = null;
        lastAuthorization = null;
        client = new AnalyticsClient(properties("http://127.0.0.1:" + server.getAddress().getPort()), JSON);
    }

    private static AnalyticsProperties properties(String baseUrl) {
        return new AnalyticsProperties(baseUrl, "test-analytics-token",
                Duration.ofSeconds(2), Duration.ofSeconds(10));
    }

    private static JsonNode plan() {
        return JSON.readTree("{\"version\": 1, \"metric\": \"spend\"}");
    }

    @Test
    void wrapsThePlanWithTheProfileIdAndSendsTheBearerToken() {
        client.execute(3L, plan());

        JsonNode sent = JSON.readTree(lastRequestBody);
        assertThat(sent.path("profileId").asInt()).isEqualTo(3);
        assertThat(sent.path("plan").path("metric").asString()).isEqualTo("spend");
        assertThat(lastAuthorization).isEqualTo("Bearer test-analytics-token");
    }

    @Test
    void returnsTheEnvelopeVerbatim() {
        JsonNode envelope = client.execute(3L, plan());

        assertThat(envelope.toString()).isEqualTo(ENVELOPE);
        assertThat(envelope.path("results").path(0).path("value").asString()).isEqualTo("1243.5000");
    }

    @Test
    void mapsAnExecutorRejectionToInvalidPlanCarryingItsProblems() {
        responseStatus = 400;
        responseBody = "{\"problems\": [\"filters.categoryId: 999 does not exist in this profile\"]}";

        assertThatThrownBy(() -> client.execute(3L, plan()))
                .isInstanceOf(InvalidPlanException.class)
                .extracting(ex -> ((InvalidPlanException) ex).toProblemDetail().getProperties().get("problems"))
                .isEqualTo(List.of("filters.categoryId: 999 does not exist in this profile"));
    }

    @Test
    void mapsAnUnexpectedStatusToAnalyticsUnavailable() {
        responseStatus = 401;
        responseBody = "{\"detail\": \"Not authenticated\"}";

        assertThatThrownBy(() -> client.execute(3L, plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsAnUnreachableServiceToAnalyticsUnavailable() throws IOException {
        AnalyticsClient offline = new AnalyticsClient(properties("http://127.0.0.1:" + closedPort()), JSON);

        assertThatThrownBy(() -> offline.execute(3L, plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsA200WithANonJsonBodyToAnalyticsUnavailable() {
        // A 2xx that isn't actually usable (e.g. a proxy's HTML error page) is still "analytics
        // answered but we cannot use it" — the same 503, not a 500 from an uncaught parse failure.
        responseStatus = 200;
        responseBody = "<html>not json</html>";

        assertThatThrownBy(() -> client.execute(3L, plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    /** A port that was bound just long enough to be sure nothing else is listening on it. */
    private static int closedPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }
}

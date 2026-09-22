package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

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
    private static String lastUpgradeHeader;
    private static int responseStatus;
    private static String responseBody;
    private static long responseDelayMillis;

    private AnalyticsClient client;

    @BeforeAll
    static void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/v1/execute", exchange -> {
            lastRequestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            lastAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
            lastUpgradeHeader = exchange.getRequestHeaders().getFirst("Upgrade");
            if (responseDelayMillis > 0) {
                try {
                    Thread.sleep(responseDelayMillis);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
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
        responseDelayMillis = 0;
        lastRequestBody = null;
        lastAuthorization = null;
        lastUpgradeHeader = null;
        client = new AnalyticsClient(
                properties("http://127.0.0.1:" + server.getAddress().getPort()), JSON);
    }

    private static AnalyticsProperties properties(String baseUrl) {
        return new AnalyticsProperties(baseUrl, "test-analytics-token", Duration.ofSeconds(2), Duration.ofSeconds(10));
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

    /**
     * Regression guard for the h2c-upgrade bug: the JDK HttpClient's default version is HTTP_2,
     * which over plaintext http:// sends an "Upgrade: h2c" header hoping the server switches
     * protocols. uvicorn's h11 parser rejects that outright ("Unsupported upgrade request"),
     * turning a healthy analytics service into a false AnalyticsUnavailableException — this stub
     * (unlike uvicorn) tolerates the header and answers normally either way, so this test can only
     * catch a revert by asserting on the request it received, not by the call failing.
     */
    @Test
    void neverSendsAnHttp2CleartextUpgradeRequest() {
        client.execute(3L, plan());

        assertThat(lastUpgradeHeader).isNull();
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
                .extracting(ex -> ((InvalidPlanException) ex)
                        .toProblemDetail()
                        .getProperties()
                        .get("problems"))
                .isEqualTo(List.of("filters.categoryId: 999 does not exist in this profile"));
    }

    @Test
    void mapsAnUnexpectedStatusToAnalyticsUnavailable() {
        responseStatus = 401;
        responseBody = "{\"detail\": \"Not authenticated\"}";

        assertThatThrownBy(() -> client.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsAnUnreachableServiceToAnalyticsUnavailable() throws IOException {
        AnalyticsClient offline = new AnalyticsClient(properties("http://127.0.0.1:" + closedPort()), JSON);

        assertThatThrownBy(() -> offline.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsA200WithANonJsonBodyToAnalyticsUnavailable() {
        // A 2xx that isn't actually usable (e.g. a proxy's HTML error page) is still "analytics
        // answered but we cannot use it" — the same 503, not a 500 from an uncaught parse failure.
        responseStatus = 200;
        responseBody = "<html>not json</html>";

        assertThatThrownBy(() -> client.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    /**
     * C5, at millisecond scale so the suite stays fast: the read timeout and the stub's delay
     * play the roles of {@code analytics.read-timeout} and a real model call respectively. This
     * pins the mechanism the property-file arithmetic in {@link
     * com.myfinance.backend.config.AnalyticsTimeoutBudgetTest} can't reach on its own — that a
     * response slower than the read timeout still becomes 503, and one inside it does not.
     */
    @Test
    void aResponseSlowerThanTheReadTimeoutBecomesAnalyticsUnavailable() {
        responseDelayMillis = 600;
        AnalyticsClient impatient = new AnalyticsClient(
                new AnalyticsProperties(
                        "http://127.0.0.1:" + server.getAddress().getPort(),
                        "test-analytics-token",
                        Duration.ofSeconds(2),
                        Duration.ofMillis(300)),
                JSON);

        assertThatThrownBy(() -> impatient.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void aResponseSlowerThanTheOldReadTimeoutButInsideTheConfiguredBudgetSucceeds() {
        // Stands in for "a generation that takes 10-60s": here, a delay well past the *old*
        // 10s-scale read timeout, served by a client configured with the wider budget C5 fixes.
        responseDelayMillis = 400;
        AnalyticsClient patient = new AnalyticsClient(
                new AnalyticsProperties(
                        "http://127.0.0.1:" + server.getAddress().getPort(),
                        "test-analytics-token",
                        Duration.ofSeconds(2),
                        Duration.ofSeconds(2)),
                JSON);

        assertThatNoException().isThrownBy(() -> patient.execute(3L, plan()));
    }

    /** A port that was bound just long enough to be sure nothing else is listening on it. */
    private static int closedPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }
}

package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.myfinance.backend.support.PlanExecutorDouble;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The proxy contract with the analytics service (docs/INSIGHTS.md "The analytics service"),
 * exercised against {@link PlanExecutorDouble} — no test ever needs the real Python process.
 */
class AnalyticsClientTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ENVELOPE = "{\"plan\":{\"version\":1},"
            + "\"results\":[{\"currency\":\"PLN\",\"shape\":\"value\",\"value\":\"1243.5000\"}],"
            + "\"meta\":{\"truncatedGroups\":false}}";

    @RegisterExtension
    static final PlanExecutorDouble EXECUTOR = PlanExecutorDouble.start();

    private AnalyticsClient client;

    @BeforeEach
    void setUp() {
        EXECUTOR.answer(200, ENVELOPE);
        client = new AnalyticsClient(properties(EXECUTOR.baseUrl()), JSON);
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

        PlanExecutorDouble.ReceivedRequest request = EXECUTOR.receivedRequests().getFirst();
        JsonNode sent = JSON.readTree(request.body());
        assertThat(sent.path("profileId").asInt()).isEqualTo(3);
        assertThat(sent.path("plan").path("metric").asString()).isEqualTo("spend");
        assertThat(request.headers().getFirst("Authorization")).isEqualTo("Bearer test-analytics-token");
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

        assertThat(EXECUTOR.receivedRequests().getFirst().headers().getFirst("Upgrade"))
                .isNull();
    }

    @Test
    void returnsTheEnvelopeVerbatim() {
        JsonNode envelope = client.execute(3L, plan());

        assertThat(envelope.toString()).isEqualTo(ENVELOPE);
        assertThat(envelope.path("results").path(0).path("value").asString()).isEqualTo("1243.5000");
    }

    @Test
    void mapsAnExecutorRejectionToInvalidPlanCarryingItsProblems() {
        EXECUTOR.answer(400, "{\"problems\": [\"filters.categoryId: 999 does not exist in this profile\"]}");

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
        EXECUTOR.answer(401, "{\"detail\": \"Not authenticated\"}");

        assertThatThrownBy(() -> client.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsAnUnreachableServiceToAnalyticsUnavailable() {
        AnalyticsClient offline = new AnalyticsClient(properties(PlanExecutorDouble.unreachableBaseUrl()), JSON);

        assertThatThrownBy(() -> offline.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsA200WithANonJsonBodyToAnalyticsUnavailable() {
        // A 2xx that isn't actually usable (e.g. a proxy's HTML error page) is still "analytics
        // answered but we cannot use it" — the same 503, not a 500 from an uncaught parse failure.
        EXECUTOR.answer(200, "<html>not json</html>");

        assertThatThrownBy(() -> client.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    /**
     * At millisecond scale so the suite stays fast: the read timeout plays the role of
     * {@code analytics.read-timeout}. A response slower than it becomes 503, and one inside it
     * does not (next test).
     */
    @Test
    void aResponseSlowerThanTheReadTimeoutBecomesAnalyticsUnavailable() {
        EXECUTOR.delayAnswers(Duration.ofMillis(600));
        AnalyticsClient impatient = new AnalyticsClient(
                new AnalyticsProperties(
                        EXECUTOR.baseUrl(), "test-analytics-token", Duration.ofSeconds(2), Duration.ofMillis(300)),
                JSON);

        assertThatThrownBy(() -> impatient.execute(3L, plan())).isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void aResponseInsideTheReadTimeoutSucceeds() {
        EXECUTOR.delayAnswers(Duration.ofMillis(400));
        AnalyticsClient patient = new AnalyticsClient(
                new AnalyticsProperties(
                        EXECUTOR.baseUrl(), "test-analytics-token", Duration.ofSeconds(2), Duration.ofSeconds(2)),
                JSON);

        assertThatNoException().isThrownBy(() -> patient.execute(3L, plan()));
    }
}

package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

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
 * exercised against {@link PlanExecutorDouble} — no test ever needs the real Python process. Every
 * executor answer asserted here is read from a recorded exchange.
 */
class AnalyticsClientTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @RegisterExtension
    static final PlanExecutorDouble EXECUTOR = PlanExecutorDouble.start();

    private static final PlanExecutorDouble.Exchange TIMESERIES = EXECUTOR.exchange("executes-a-monthly-timeseries");
    private static final PlanExecutorDouble.Exchange UNKNOWN_CATEGORY =
            EXECUTOR.exchange("rejects-an-unknown-category");

    private AnalyticsClient client;

    @BeforeEach
    void setUp() {
        client = new AnalyticsClient(properties(PlanExecutorDouble.TOKEN, Duration.ofSeconds(10)), JSON);
    }

    private static AnalyticsProperties properties(String token, Duration readTimeout) {
        return new AnalyticsProperties(EXECUTOR.baseUrl(), token, Duration.ofSeconds(2), readTimeout);
    }

    @Test
    void wrapsThePlanWithTheProfileId() {
        client.execute(3L, TIMESERIES.plan());

        JsonNode sent = EXECUTOR.receivedRequests().getFirst();
        assertThat(sent.path("profileId").asInt()).isEqualTo(3);
        assertThat(sent.path("plan")).isEqualTo(TIMESERIES.plan());
    }

    /**
     * Regression guard for the h2c-upgrade bug: the JDK HttpClient's default version is HTTP_2,
     * which over plaintext http:// offers an upgrade ("Upgrade: h2c"). The shipped executor answered
     * that offer with a plain-text 400, which AnalyticsClient reports as analytics-unavailable, so
     * every insight failed. The stand-in refuses an upgrade offer the same way, so reverting
     * AnalyticsClient's HTTP/1.1 pin fails every test that calls it. This test keeps the guard
     * honest: a client left at the default version is refused, and AnalyticsClient is not.
     */
    @Test
    void anHttp2UpgradeOfferIsRefusedAndAnalyticsClientMakesNone() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(EXECUTOR.baseUrl() + "/internal/v1/execute"))
                .header("Authorization", "Bearer " + PlanExecutorDouble.TOKEN)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"profileId\":3,\"plan\":" + TIMESERIES.plan() + "}"))
                .build();
        try (HttpClient defaultVersion = HttpClient.newHttpClient()) {
            HttpResponse<String> refused = defaultVersion.send(request, HttpResponse.BodyHandlers.ofString());

            assertThat(refused.statusCode()).isEqualTo(400);
            assertThat(refused.body()).isEqualTo("Invalid HTTP request received.");
        }

        assertThat(client.execute(3L, TIMESERIES.plan()).toString()).isEqualTo(TIMESERIES.body());
    }

    @Test
    void returnsTheEnvelopeVerbatim() {
        JsonNode envelope = client.execute(3L, TIMESERIES.plan());

        assertThat(envelope.toString()).isEqualTo(TIMESERIES.body());
        assertThat(envelope.path("results")
                        .path(0)
                        .path("points")
                        .path(0)
                        .path("value")
                        .asString())
                .isEqualTo("0.0000");
    }

    @Test
    void mapsAnExecutorRejectionToInvalidPlanCarryingItsProblems() {
        assertThatThrownBy(() -> client.execute(3L, UNKNOWN_CATEGORY.plan()))
                .isInstanceOf(InvalidPlanException.class)
                .extracting(ex -> ((InvalidPlanException) ex)
                        .toProblemDetail()
                        .getProperties()
                        .get("problems"))
                .isEqualTo(UNKNOWN_CATEGORY.problems());
    }

    /** The executor's 500 carries a {@code problems} list too; it must not read as a rejected plan. */
    @Test
    void mapsAnExecutorFailureToAnalyticsUnavailableNotInvalidPlan() {
        EXECUTOR.databaseFails();

        assertThatThrownBy(() -> client.execute(3L, TIMESERIES.plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsAnUnexpectedStatusToAnalyticsUnavailable() {
        AnalyticsClient wrongToken = new AnalyticsClient(properties("not-the-token", Duration.ofSeconds(10)), JSON);

        assertThatThrownBy(() -> wrongToken.execute(3L, TIMESERIES.plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsAnUnreachableServiceToAnalyticsUnavailable() {
        AnalyticsClient offline = new AnalyticsClient(
                new AnalyticsProperties(
                        PlanExecutorDouble.unreachableBaseUrl(),
                        PlanExecutorDouble.TOKEN,
                        Duration.ofSeconds(2),
                        Duration.ofSeconds(10)),
                JSON);

        assertThatThrownBy(() -> offline.execute(3L, TIMESERIES.plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsA200WithANonJsonBodyToAnalyticsUnavailable() {
        // A 2xx that isn't actually usable (e.g. a proxy's HTML error page) is still "analytics
        // answered but we cannot use it" — the same 503, not a 500 from an uncaught parse failure.
        EXECUTOR.answerNextWithAProxyPage();

        assertThatThrownBy(() -> client.execute(3L, TIMESERIES.plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    /**
     * At millisecond scale so the suite stays fast: the read timeout plays the role of
     * {@code analytics.read-timeout}. A response slower than it becomes 503, and one inside it
     * does not (next test).
     */
    @Test
    void aResponseSlowerThanTheReadTimeoutBecomesAnalyticsUnavailable() {
        EXECUTOR.delayAnswers(Duration.ofMillis(600));
        AnalyticsClient impatient =
                new AnalyticsClient(properties(PlanExecutorDouble.TOKEN, Duration.ofMillis(300)), JSON);

        assertThatThrownBy(() -> impatient.execute(3L, TIMESERIES.plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void aResponseInsideTheReadTimeoutSucceeds() {
        EXECUTOR.delayAnswers(Duration.ofMillis(400));
        AnalyticsClient patient =
                new AnalyticsClient(properties(PlanExecutorDouble.TOKEN, Duration.ofSeconds(2)), JSON);

        assertThatNoException().isThrownBy(() -> patient.execute(3L, TIMESERIES.plan()));
    }
}

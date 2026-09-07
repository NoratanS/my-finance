package com.myfinance.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.DurationStyle;

import java.io.FileInputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * C5: {@code analytics.read-timeout} (application.properties) must exceed the analytics
 * service's own worst-case LLM budget, or a generation that would have succeeded is cut off
 * and misreported as {@code 503 /errors/analytics-unavailable} (docs/API.md "Status code
 * summary") while analytics keeps working. No Spring context needed — this reads the same
 * property file Boot binds {@link AnalyticsProperties} from and checks the arithmetic
 * directly, so it stays fast and fails the moment either side of the equation drifts.
 */
class AnalyticsTimeoutBudgetTest {

    /**
     * Mirrors {@code httpx.Timeout(60.0, connect=2.0)} in analytics/src/analytics/llm/client.py.
     */
    private static final Duration MODEL_CALL_TIMEOUT = Duration.ofSeconds(60);

    /**
     * interpret() ("One call, one retry", analytics/src/analytics/llm/interpret.py) is the
     * worst case among /interpret, /narrate (one call) and /execute (no LLM call at all) —
     * two model calls back to back before analytics itself gives up.
     */
    private static final int MAX_MODEL_CALLS = 2;

    @Test
    void backendReadTimeoutExceedsTheAnalyticsWorstCaseBudget() throws IOException {
        Duration readTimeout = readTimeoutProperty();
        Duration analyticsWorstCase = MODEL_CALL_TIMEOUT.multipliedBy(MAX_MODEL_CALLS);

        assertThat(readTimeout)
                .as("analytics.read-timeout must clear %s (2 x the 60s model-call timeout) "
                        + "with headroom, or a slow-but-successful generation is misreported as "
                        + "the analytics service being down (C5)", analyticsWorstCase)
                .isGreaterThan(analyticsWorstCase);
    }

    private static Duration readTimeoutProperty() throws IOException {
        Properties props = new Properties();
        try (FileInputStream in = new FileInputStream("src/main/resources/application.properties")) {
            props.load(in);
        }
        return DurationStyle.detectAndParse(props.getProperty("analytics.read-timeout"));
    }
}

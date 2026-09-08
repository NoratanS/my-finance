package com.myfinance.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.DurationStyle;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * C5: {@code analytics.read-timeout} (application.properties) must exceed the analytics
 * service's own worst-case LLM budget, or a generation that would have succeeded is cut off
 * and misreported as {@code 503 /errors/analytics-unavailable} (docs/API.md "Status code
 * summary") while analytics keeps working. No Spring context needed — this reads the backend's
 * property file directly, and parses the analytics side's own source out of
 * analytics/src/analytics/llm/client.py rather than mirroring it as a constant, so it fails the
 * moment either side of the equation drifts — including analytics' side moving alone, which a
 * hardcoded mirror would not have caught.
 */
class AnalyticsTimeoutBudgetTest {

    /**
     * Both {@code /interpret} ({@code interpret()}, "one call, one retry",
     * analytics/src/analytics/llm/interpret.py) and {@code /narrate} ({@code narrate()}, a
     * {@code for _ in range(2)} loop over the same call-then-retry shape,
     * analytics/src/analytics/llm/narrate.py) call the model at most twice before giving up;
     * {@code /execute} makes no model call at all. Two model calls back to back is therefore
     * the worst case across every route analytics can serve.
     */
    private static final int MAX_MODEL_CALLS = 2;

    @Test
    void backendReadTimeoutExceedsTheAnalyticsWorstCaseBudget() throws IOException {
        Duration readTimeout = readTimeoutProperty();
        Duration analyticsWorstCase = analyticsModelCallTimeout().multipliedBy(MAX_MODEL_CALLS);

        assertThat(readTimeout)
                .as("analytics.read-timeout must clear %s (2 x the analytics model-call timeout) "
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

    /**
     * Reads {@code httpx.Timeout(60.0, connect=2.0)} straight out of
     * analytics/src/analytics/llm/client.py rather than mirroring the 60.0 as a hardcoded
     * constant here — a hardcoded mirror only ever catches backend-side drift; raising the
     * analytics budget alone would pass silently. Deliberately brittle: if OllamaClient's
     * timeout construction ever changes shape, this fails loudly instead of quietly checking
     * the wrong number.
     */
    private static Duration analyticsModelCallTimeout() throws IOException {
        String source = Files.readString(Path.of("../analytics/src/analytics/llm/client.py"));
        Matcher matcher = Pattern.compile("httpx\\.Timeout\\(\\s*(\\d+(?:\\.\\d+)?)").matcher(source);
        if (!matcher.find()) {
            throw new IllegalStateException(
                    "could not find httpx.Timeout(<seconds>, ...) in "
                            + "analytics/src/analytics/llm/client.py — update this parser if "
                            + "OllamaClient's timeout construction changed shape.");
        }
        double seconds = Double.parseDouble(matcher.group(1));
        return Duration.ofMillis(Math.round(seconds * 1000));
    }
}

package com.myfinance.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * The degraded path: analytics is simply not running (docs/API.md "POST /api/insights/execute").
 * analytics.base-url points at a port nothing listens on, so the connection is refused.
 */
@IntegrationTest
class InsightExecuteUnavailableTest {

    private static final String PLAN = "{\"version\": 1, \"metric\": \"spend\"}";
    private static final int CLOSED_PORT = closedPort();

    /** Bound just long enough to be sure nothing else claims it, then released. */
    private static int closedPort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + CLOSED_PORT);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void executeIs503WhenAnalyticsIsNotRunning() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("/errors/analytics-unavailable"))
                .andExpect(jsonPath("$.title").value("Analytics service unavailable"));
    }
}

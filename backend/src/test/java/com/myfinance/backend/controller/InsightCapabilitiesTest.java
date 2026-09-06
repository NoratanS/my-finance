package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/insights/capabilities (docs/API.md "Insights"). The analytics service is a stub
 * HTTP server on a random port — no Python, no container, and above all no model: CI never
 * runs one (design delta D11).
 */
@IntegrationTest
class InsightCapabilitiesTest {

    // Started in a static initializer, not @BeforeAll: @DynamicPropertySource is evaluated
    // while the Spring context is built, which happens before any user @BeforeAll runs.
    private static final HttpServer ANALYTICS = startStub();

    private static volatile int stubStatus = 200;
    private static volatile String stubBody = "{\"interpret\":true,\"model\":\"qwen3:4b\"}";
    private static volatile String seenAuthorization;

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/internal/v1/capabilities", exchange -> {
                seenAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
                byte[] payload = stubBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(stubStatus, payload.length);
                try (OutputStream body = exchange.getResponseBody()) {
                    body.write(payload);
                }
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void analyticsUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + ANALYTICS.getAddress().getPort());
    }

    @AfterAll
    static void stopStub() {
        ANALYTICS.stop(0);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;

    @BeforeEach
    void setUp() {
        stubStatus = 200;
        stubBody = "{\"interpret\":true,\"model\":\"qwen3:4b\"}";
        seenAuthorization = null;
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void reportsInterpretationAvailableAndForwardsTheInternalToken() throws Exception {
        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(true))
                .andExpect(jsonPath("$.model").value("qwen3:4b"));

        assertThat(seenAuthorization).startsWith("Bearer ");
    }

    @Test
    void reportsInterpretationUnavailableWhenTheAiLayerIsOff() throws Exception {
        stubBody = "{\"interpret\":false,\"model\":null}";

        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(false))
                .andExpect(jsonPath("$.model").doesNotExist());
    }

    /** A broken analytics service means interpretation is unavailable — the question asked. */
    @Test
    void degradesToUnavailableInsteadOf503WhenAnalyticsFails() throws Exception {
        stubStatus = 500;
        stubBody = "{\"error\":\"boom\"}";

        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(false))
                .andExpect(jsonPath("$.model").doesNotExist());
    }

    /** Instance-wide, not profile data: authenticated is enough, no active profile needed. */
    @Test
    void answersWithoutAnActiveProfile() throws Exception {
        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.as(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(true));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/insights/capabilities"))
                .andExpect(status().isUnauthorized());
    }
}

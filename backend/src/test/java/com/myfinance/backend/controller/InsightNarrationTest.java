package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST /api/insights/narrate (docs/API.md "Insights"). The analytics service is replaced by a
 * JDK HttpServer, so the test needs neither Python nor a model; what it pins is the contract the
 * backend relies on — the plan is executed first, the caption is asked for the envelope that came
 * back, the profile id crossing the internal network is the session's never the body's, and a
 * narration leg that fails after a successful execute leg is a 503, not a 200 that silently
 * papers over an operational failure.
 */
@IntegrationTest
class InsightNarrationTest {

    private static final String PLAN = """
            {"version":1,"metric":"spend","filters":{"currency":"PLN"},
             "groupBy":null,"interval":null,"range":{"type":"yearToDate"}}""";

    private static final String ENVELOPE = """
            {"plan":{"version":1,"metric":"spend","filters":{"currency":"PLN"},
             "groupBy":null,"interval":null,"range":{"type":"yearToDate"}},
             "results":[{"currency":"PLN","shape":"value","value":"1243.5000"}],
             "meta":{"truncatedGroups":false}}""";

    private static HttpServer analytics;
    private static volatile int executeStatus;
    private static volatile String executeBody;
    private static volatile int narrateStatus;
    private static volatile String narrateBody;
    private static final List<String> CALLS = new ArrayList<>();
    private static final List<String> BODIES = new ArrayList<>();

    @BeforeAll
    static void startStub() throws IOException {
        analytics = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        analytics.createContext("/internal/v1/execute", exchange -> respond(exchange, executeStatus, executeBody));
        analytics.createContext("/internal/v1/narrate", exchange -> respond(exchange, narrateStatus, narrateBody));
        analytics.start();
    }

    @AfterAll
    static void stopStub() {
        analytics.stop(0);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        String path = exchange.getRequestURI().getPath();
        try (var in = exchange.getRequestBody()) {
            BODIES.add(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
        CALLS.add(path + " " + exchange.getRequestHeaders().getFirst("Authorization"));
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @DynamicPropertySource
    static void analyticsStub(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + analytics.getAddress().getPort());
        registry.add("analytics.token", () -> "test-analytics-token");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;

    @BeforeEach
    void setUp() {
        CALLS.clear();
        BODIES.clear();
        executeStatus = 200;
        executeBody = ENVELOPE;
        narrateStatus = 200;
        narrateBody = "{\"caption\":\"PLN total 1243.50.\"}";
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void narrateExecutesThePlanThenCaptionsTheEnvelope() throws Exception {
        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caption").value("PLN total 1243.50."));

        assertThat(CALLS).containsExactly(
                "/internal/v1/execute Bearer test-analytics-token",
                "/internal/v1/narrate Bearer test-analytics-token");
        assertThat(BODIES.get(0)).contains("\"profileId\":" + profile.getId());
        assertThat(BODIES.get(1)).contains("\"envelope\"").contains("1243.5000");
    }

    @Test
    void narrateScopesToTheSessionProfileNotTheBody() throws Exception {
        User other = fixtures.user("bartek@example.com");
        Profile otherProfile = fixtures.profile(other, "Other", "PLN");

        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk());

        assertThat(BODIES.get(0))
                .contains("\"profileId\":" + profile.getId())
                .doesNotContain("\"profileId\":" + otherProfile.getId());
    }

    @Test
    void narrateRejectsABodyThatIsNotAPlanObject() throws Exception {
        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content("[1,2,3]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"));

        assertThat(CALLS).isEmpty();
    }

    @Test
    void narrateRequiresAnActiveProfile() throws Exception {
        User user = fixtures.user("no-profile@example.com");

        mockMvc.perform(post("/api/insights/narrate").with(fixtures.as(user))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isConflict());

        assertThat(CALLS).isEmpty();
    }

    /**
     * The decision this task had to make explicitly: analytics answered once already (the
     * execute leg succeeded, so the envelope is real), but the narrate leg then fails. That is
     * an operational failure of the thing the caller asked for (a caption), not a probe like
     * capabilities — so it is a 503, matching /execute and /interpret's own precedent, not a 200
     * with an empty or missing caption.
     */
    @Test
    void aNarrateLegFailureAfterASuccessfulExecuteLegIs503() throws Exception {
        narrateStatus = 500;
        narrateBody = "{}";

        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("/errors/analytics-unavailable"));

        assertThat(CALLS).containsExactly(
                "/internal/v1/execute Bearer test-analytics-token",
                "/internal/v1/narrate Bearer test-analytics-token");
    }
}

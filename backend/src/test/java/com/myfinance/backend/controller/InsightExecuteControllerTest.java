package com.myfinance.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.AfterAll;
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
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * POST /api/insights/execute against a stub analytics service (docs/API.md "Insights"). The stub
 * is a JDK HttpServer on a random loopback port, started before the Spring context is built and
 * pointed at by analytics.base-url — no test here needs the real Python service.
 */
@IntegrationTest
class InsightExecuteControllerTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;
    private static final String ENVELOPE = "{\"plan\":{\"version\":1},"
            + "\"results\":[{\"currency\":\"PLN\",\"shape\":\"timeseries\","
            + "\"points\":[{\"period\":\"2026-07\",\"value\":\"980.2100\"},"
            + "{\"period\":\"2026-08\",\"value\":\"0.0000\"}]}],"
            + "\"meta\":{\"truncatedGroups\":false}}";

    private static final HttpServer ANALYTICS = startStub();
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static String lastRequestBody;
    private static int responseStatus;
    private static String responseBody;

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/internal/v1/execute", exchange -> {
                lastRequestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(responseStatus, out.length);
                exchange.getResponseBody().write(out);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add(
                "analytics.base-url",
                () -> "http://127.0.0.1:" + ANALYTICS.getAddress().getPort());
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
        responseStatus = 200;
        responseBody = ENVELOPE;
        lastRequestBody = null;

        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void executeReturnsTheEnvelopeVerbatim() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isOk())
                // Byte-for-byte: "passed through verbatim" is the contract, not "equivalent JSON".
                .andExpect(content().string(ENVELOPE))
                .andExpect(jsonPath("$.results[0].points[1].value").value("0.0000"));
    }

    @Test
    void executeForwardsTheSessionProfileAndThePlan() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isOk());

        JsonNode sent = JSON.readTree(lastRequestBody);
        assertThat(sent.path("profileId").asLong()).isEqualTo(profile.getId());
        assertThat(sent.path("plan").path("interval").asString()).isEqualTo("month");
    }

    @Test
    void aProfileIdSmuggledIntoTheBodyIsIgnored() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\": 1, \"metric\": \"spend\", \"profileId\": 999999}"))
                .andExpect(status().isOk());

        JsonNode sent = JSON.readTree(lastRequestBody);
        assertThat(sent.path("profileId").asLong()).isEqualTo(profile.getId());
    }

    @Test
    void executeWithANonObjectBodyIs400InvalidPlanWithoutCallingAnalytics() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[1, 2]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems", contains("plan: must be a JSON object")));

        assertThat(lastRequestBody).isNull();
    }

    @Test
    void anExecutorRejectionIs400WithTheProblemsPassedThrough() throws Exception {
        responseStatus = 400;
        responseBody = "{\"problems\": [\"filters.categoryId: 999 does not exist in this profile\"]}";

        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems", contains("filters.categoryId: 999 does not exist in this profile")));
    }

    @Test
    void anUnsupportedVersionIsTheExecutorsRejection() throws Exception {
        // D7: the backend does not know the version set; it forwards and reports what comes back.
        responseStatus = 400;
        responseBody = "{\"problems\": [\"version: 7 is not supported\"]}";

        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\": 7, \"metric\": \"spend\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems", contains("version: 7 is not supported")));
    }

    @Test
    void executeWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        // A CSRF token is supplied so this exercises the authentication check, not the CSRF
        // gate: TestFixtures.csrf() exists precisely for unauthenticated mutating requests
        // (see AuthControllerTest's register/login tests) since CSRF is checked before auth.
        mockMvc.perform(post("/api/insights/execute")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isUnauthorized());
    }
}

package com.myfinance.backend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * POST /api/insights/interpret against a stub analytics service (a JDK
 * HttpServer on an ephemeral port) — the pass-through, the error translation,
 * and above all that the profile forwarded is the session's, never the body's.
 */
@IntegrationTest
class InsightInterpretTest {

    private static HttpServer analytics;
    private static volatile int stubStatus = 200;
    private static volatile String stubBody = "{}";
    private static volatile String receivedBody = "";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;

    @BeforeAll
    static void startStub() throws IOException {
        analytics = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        analytics.createContext("/internal/v1/interpret", exchange -> {
            receivedBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            byte[] out = stubBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(stubStatus, out.length);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(out);
            }
        });
        analytics.start();
    }

    @AfterAll
    static void stopStub() {
        analytics.stop(0);
    }

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + analytics.getAddress().getPort());
    }

    @BeforeEach
    void setUp() {
        stubStatus = 200;
        stubBody = """
                {"plan": {"version": 1, "metric": "spend", "filters": {}, "range": {"type": "all"}},
                 "notes": ["Filtered to category 'Groceries' (id 12)."]}
                """;
        receivedBody = "";
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    private static String body(String text) {
        return """
                {"text": "%s", "currentPlan": null}
                """.formatted(text);
    }

    @Test
    void interpretPassesTheDraftThroughAndForwardsTheSessionProfile() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("monthly groceries")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.metric").value("spend"))
                .andExpect(jsonPath("$.notes[0]", containsString("Groceries")));

        Assertions.assertThat(receivedBody)
                .contains("\"profileId\":" + profile.getId())
                .contains("monthly groceries");
    }

    @Test
    void interpretIgnoresAClientSuppliedProfileId() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\": \"anything\", \"profileId\": 999999}"))
                // Boot leaves FAIL_ON_UNKNOWN_PROPERTIES off, so the stray field is
                // dropped and this is a 200. If it turns out to be a 400, the property
                // under test holds even more strongly — flip the expectation.
                .andExpect(status().isOk());

        Assertions.assertThat(receivedBody)
                .contains("\"profileId\":" + profile.getId())
                .doesNotContain("999999");
    }

    @Test
    void analyticsRejectionBecomes422InterpretFailedWithProblems() throws Exception {
        stubStatus = 422;
        stubBody = "{\"problems\": [\"could not interpret\"]}";

        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("gibberish")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/interpret-failed"))
                .andExpect(jsonPath("$.problems[0]").value("could not interpret"));
    }

    @Test
    void analyticsFailureBecomes503() throws Exception {
        stubStatus = 500;
        stubBody = "{}";

        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("anything")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("/errors/analytics-unavailable"));
    }

    @Test
    void blankTextIs400() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("   ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void overLongTextIs400() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("a".repeat(501))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void anOversizedCurrentPlanIs400() throws Exception {
        // currentPlan is the one field that reaches the model without being validated
        // first, so the cost of an oversized one falls on local inference. The widest
        // plan the DSL permits is ~2.8 kB; this is comfortably past that.
        String padding = "x".repeat(5000);
        String body = """
                {"text": "compare these", "currentPlan": {"version": 1, "note": "%s"}}
                """.formatted(padding);

        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"));
    }

    @Test
    void aCurrentPlanThatIsNotAJsonObjectIs400() throws Exception {
        // C7: currentPlan structurally invalid (here, a JSON array) must be a 400 the backend
        // catches itself — not a 422 relayed from analytics' pydantic validation, which would
        // tell the user "the model failed" for what is actually a caller bug.
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\": \"hello\", \"currentPlan\": [1, 2, 3]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"));
    }

    @Test
    void aNormalCurrentPlanIsNotRejected() throws Exception {
        // The bound must not refuse a legitimate refinement, including the widest
        // shape the DSL allows: 25 merchants of 100 characters.
        String merchants = java.util.stream.IntStream.range(0, 25)
                .mapToObj(i -> "\"" + "m".repeat(100) + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        String body = """
                {"text": "narrow it", "currentPlan": {"version": 1, "metric": "spend",
                 "filters": {"merchants": [%s]}, "groupBy": "merchant",
                 "interval": "month", "range": {"type": "lastMonths", "n": 12}}}
                """.formatted(merchants);

        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    @Test
    void interpretWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("anything")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        // A CSRF token is supplied so this exercises the authentication check, not the CSRF
        // gate: TestFixtures.csrf() exists precisely for unauthenticated mutating requests
        // (see InsightExecuteControllerTest, AuthControllerTest's register/login tests) since
        // CSRF is checked before auth.
        mockMvc.perform(post("/api/insights/interpret").with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("anything")))
                .andExpect(status().isUnauthorized());
    }
}

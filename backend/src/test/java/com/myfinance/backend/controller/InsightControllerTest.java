package com.myfinance.backend.controller;

import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The 5 CRUD endpoints of docs/API.md "Insights" (execute has its own test class). */
@IntegrationTest
class InsightControllerTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;
    private Profile otherProfile;

    @BeforeEach
    void setUp() {
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");

        User other = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(other, "Other", "EUR");
    }

    private static String body(String name, boolean pinned) {
        return """
                {"name": "%s", "plan": %s, "viz": null, "pinned": %s}
                """.formatted(name, PLAN, pinned);
    }

    // ---------------------------------------------------------------- POST

    @Test
    void createReturns201WithLocationAndBody() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", true)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Groceries per month"))
                .andExpect(jsonPath("$.plan.metric").value("spend"))
                .andExpect(jsonPath("$.plan.range.n").value(12))
                .andExpect(jsonPath("$.viz").value((Object) null))
                .andExpect(jsonPath("$.pinned").value(true))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Location", matchesPattern("/api/insights/\\d+")));
    }

    @Test
    void createDefaultsPinnedToFalseAndAcceptsAVizOverride() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Chart override", "plan": %s, "viz": {"chart": "bar"}}
                                """.formatted(PLAN)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pinned").value(false))
                .andExpect(jsonPath("$.viz.chart").value("bar"));
    }

    @Test
    void createWithMissingFieldsIs400() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Groceries per month\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("plan"));
    }

    @Test
    void createWithANonObjectPlanIs400InvalidPlan() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Broken\", \"plan\": [1, 2]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems", contains("plan: must be a JSON object")));
    }

    @Test
    void createWithTakenNameIs409() throws Exception {
        fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/insight-name-taken"));
    }

    @Test
    void nameTakenInAnotherProfileIsNotACollision() throws Exception {
        fixtures.insight(otherProfile, "Groceries per month", PLAN, false);

        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isCreated());
    }

    @Test
    void createWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/insights"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- GET list

    @Test
    void listIsPinnedFirstThenAlphabetical() throws Exception {
        fixtures.insight(profile, "Zebra spend", PLAN, false);
        fixtures.insight(profile, "Apple spend", PLAN, false);
        fixtures.insight(profile, "Pinned monthly", PLAN, true);

        mockMvc.perform(get("/api/insights").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name").value(contains(
                        "Pinned monthly", "Apple spend", "Zebra spend")));
    }

    @Test
    void listDoesNotLeakOtherProfiles() throws Exception {
        fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(get("/api/insights").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ---------------------------------------------------------------- GET one

    @Test
    void getReturnsTheInsight() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(get("/api/insights/{id}", insight.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(insight.getId()))
                .andExpect(jsonPath("$.plan.interval").value("month"));
    }

    @Test
    void getFromAnotherProfileIs404() throws Exception {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(get("/api/insights/{id}", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ---------------------------------------------------------------- PUT

    @Test
    void updateReplacesEveryEditableField() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", insight.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Groceries per quarter", "plan": {"version": 1, "metric": "net",
                                 "filters": {}, "groupBy": null, "interval": "quarter",
                                 "range": {"type": "yearToDate"}}, "viz": {"chart": "line"}, "pinned": true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Groceries per quarter"))
                .andExpect(jsonPath("$.plan.metric").value("net"))
                .andExpect(jsonPath("$.plan.range.type").value("yearToDate"))
                .andExpect(jsonPath("$.viz.chart").value("line"))
                .andExpect(jsonPath("$.pinned").value(true));
    }

    @Test
    void renamingToItsOwnNameIsNotACollision() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", insight.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pinned").value(true));
    }

    @Test
    void renamingOntoAnotherInsightIs409() throws Exception {
        fixtures.insight(profile, "Groceries per month", PLAN, false);
        Insight other = fixtures.insight(profile, "Fuel per month", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", other.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/insight-name-taken"));
    }

    @Test
    void updateFromAnotherProfileIs404() throws Exception {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", theirs.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Renamed", false)))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- DELETE

    @Test
    void deleteReturns204() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(delete("/api/insights/{id}", insight.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/insights/{id}", insight.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteFromAnotherProfileIs404() throws Exception {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(delete("/api/insights/{id}", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }
}

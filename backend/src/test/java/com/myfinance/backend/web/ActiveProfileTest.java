package com.myfinance.backend.web;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;
import com.myfinance.backend.support.IntegrationTest;

/**
 * The active profile travels in the {@code X-Profile-Id} request header (docs/API.md "Active
 * profile: one header, resolved in one place"). Everything here goes over HTTP: profiles and
 * their rows are created through the API, with nothing planted behind it.
 */
@IntegrationTest
class ActiveProfileTest {

    private static final String PROFILE_HEADER = "X-Profile-Id";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void aRequestIsAnsweredFromTheProfileItsHeaderNames() throws Exception {
        long personal = createProfile("Personal");
        long company = createProfile("Company");
        createCategory(personal, "Groceries");
        createCategory(company, "Office");

        mockMvc.perform(get("/api/categories").header(PROFILE_HEADER, personal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Groceries"));
        mockMvc.perform(get("/api/categories").header(PROFILE_HEADER, company))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Office"));
    }

    // ---------------------------------------------------------------- no active profile

    @Test
    void aRequestWithoutTheHeaderHasNoActiveProfile() throws Exception {
        createProfile("Personal");

        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    /** Empty is what the frontend sends before a profile is chosen; the rest is a damaged value. */
    @ParameterizedTest
    @ValueSource(strings = {"", " ", "abc", "1.5", "12abc", "99999999999999999999"})
    void aHeaderThatIsNotAProfileIdMeansNoActiveProfile(String value) throws Exception {
        createProfile("Personal");

        mockMvc.perform(get("/api/categories").header(PROFILE_HEADER, value))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"999999", "0", "-1"})
    void aHeaderNamingAProfileThatDoesNotExistMeansNoActiveProfile(String value) throws Exception {
        createProfile("Personal");

        mockMvc.perform(get("/api/categories").header(PROFILE_HEADER, value))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void aDeletedProfileIsNoLongerAnActiveProfile() throws Exception {
        long personal = createProfile("Personal");
        createCategory(personal, "Groceries");
        mockMvc.perform(delete("/api/profiles/{id}", personal).header(PROFILE_HEADER, personal))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/categories").header(PROFILE_HEADER, personal))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    /** The header is there, so this is not the missing-header rule: it names no profile. */
    @Test
    void aChangingRequestWhoseHeaderNamesNoProfileHasNoActiveProfile() throws Exception {
        createProfile("Personal");

        mockMvc.perform(post("/api/categories")
                        .header(PROFILE_HEADER, "abc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Groceries\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    // ---------------------------------------------------------------- rows of another profile

    @Test
    void aRowOfAnotherProfileAnswersNotFound() throws Exception {
        long personal = createProfile("Personal");
        long company = createProfile("Company");
        long groceries = createCategory(personal, "Groceries");

        mockMvc.perform(get("/api/categories/{id}", groceries).header(PROFILE_HEADER, company))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
        mockMvc.perform(patch("/api/categories/{id}", groceries)
                        .header(PROFILE_HEADER, company)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Taken over\"}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/categories/{id}", groceries).header(PROFILE_HEADER, company))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/categories/{id}", groceries).header(PROFILE_HEADER, personal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Groceries"));
    }

    // ---------------------------------------------------------------- above the profile boundary

    @Test
    void endpointsAboveTheProfileBoundaryDoNotReadTheHeadersValue() throws Exception {
        long personal = createProfile("Personal");

        mockMvc.perform(get("/api/profiles")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get("/api/profiles").header(PROFILE_HEADER, "not-a-number"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get("/api/profiles/{id}", personal).header(PROFILE_HEADER, "999999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Personal"));
        mockMvc.perform(put("/api/profiles/{id}", personal)
                        .header(PROFILE_HEADER, "999999")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Household\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Household"));
        mockMvc.perform(post("/api/backup/export")
                        .header(PROFILE_HEADER, "not-a-number")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileIds\":[" + personal + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].name").value("Household"));
        mockMvc.perform(delete("/api/profiles/{id}", personal).header(PROFILE_HEADER, "not-a-number"))
                .andExpect(status().isNoContent());
    }

    // ---------------------------------------------------------------- helpers

    /** Profiles sit above the profile boundary: creating one names no active profile. */
    private long createProfile(String name) throws Exception {
        String body = mockMvc.perform(post("/api/profiles")
                        .header(PROFILE_HEADER, "")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return idOf(body);
    }

    private long createCategory(long profileId, String name) throws Exception {
        String body = mockMvc.perform(post("/api/categories")
                        .header(PROFILE_HEADER, profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return idOf(body);
    }

    private static long idOf(String json) {
        return JsonPath.<Number>read(json, "$.id").longValue();
    }
}

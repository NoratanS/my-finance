package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.security.SessionActiveProfile;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class ProfileControllerTest {

    private static final RequestPostProcessor CSRF = TestFixtures::withCsrf;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private ProfileRepository profileRepository;

    @Test
    void listReturnsOnlyOwnProfilesOrderedByCreation() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        Profile company = fixtures.profile(chris, "Company", "EUR");
        User other = fixtures.user("other@example.com");
        fixtures.profile(other, "Personal", "USD");

        mockMvc.perform(get("/api/profiles").with(fixtures.as(chris)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(personal.getId()))
                .andExpect(jsonPath("$[0].name").value("Personal"))
                .andExpect(jsonPath("$[0].defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$[0].createdAt").isString())
                .andExpect(jsonPath("$[1].id").value(company.getId()));
    }

    @Test
    void listIsEmptyArrayForNewUser() throws Exception {
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(get("/api/profiles").with(fixtures.as(chris)))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void listUnauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/profiles")).andExpect(status().isUnauthorized());
    }

    @Test
    void createReturns201WithLocationAndDoesNotSwitchActiveProfile() throws Exception {
        fixtures.user("chris@example.com");
        MockHttpSession session = loginSession("chris@example.com");

        MvcResult result = mockMvc.perform(post("/api/profiles").session(session).with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/profiles/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Personal"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andReturn();

        assertThat(session.getAttribute(SessionActiveProfile.SESSION_KEY)).isNull();
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(jsonPath("$.activeProfileId").value((Object) null))
                .andExpect(jsonPath("$.profiles", hasSize(1)));
        assertThat(profileRepository.count()).isEqualTo(1);
        assertThat(result.getResponse().getHeader("Location"))
                .endsWith("/" + profileRepository.findAll().get(0).getId());
    }

    @Test
    void createRejectsInvalidBodyWith400() throws Exception {
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/profiles").with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"defaultCurrency\":\"pln\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(2)));
    }

    @Test
    void createWithDuplicateNameForSameUserIs409() throws Exception {
        User chris = fixtures.user("chris@example.com");
        fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(post("/api/profiles").with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"EUR\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/profile-name-taken"));
    }

    @Test
    void sameProfileNameIsAllowedForDifferentUsers() throws Exception {
        User other = fixtures.user("other@example.com");
        fixtures.profile(other, "Personal", "PLN");
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/profiles").with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated());
    }

    private MockHttpSession loginSession(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login").with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + TestFixtures.DEFAULT_PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }
}

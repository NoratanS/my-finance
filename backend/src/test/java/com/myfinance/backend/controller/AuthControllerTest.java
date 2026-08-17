package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;
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
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class AuthControllerTest {

    private static final RequestPostProcessor CSRF = TestFixtures::withCsrf;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private UserRepository userRepository;

    // ---- register ----

    @Test
    void registerCreatesUserAndLowercasesEmail() throws Exception {
        mockMvc.perform(post("/api/auth/register").with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"Chris@Example.COM","password":"correct-horse-battery","displayName":"Chris"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.email").value("chris@example.com"))
                .andExpect(jsonPath("$.displayName").value("Chris"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(content().string(not(containsString("$2a$"))));

        User saved = userRepository.findByEmail("chris@example.com").orElseThrow();
        assertThat(saved.getPasswordHash()).startsWith("$2").isNotEqualTo("correct-horse-battery");
    }

    @Test
    void registerDoesNotLogIn() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register").with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"chris@example.com","password":"correct-horse-battery","displayName":"Chris"}
                                """))
                .andExpect(status().isCreated())
                .andReturn();

        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        var me = get("/api/auth/me");
        if (session != null) {
            me = me.session(session);
        }
        mockMvc.perform(me).andExpect(status().isUnauthorized());
    }

    @Test
    void registerRejectsInvalidBodyWith400() throws Exception {
        mockMvc.perform(post("/api/auth/register").with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"not-an-email","password":"short","displayName":""}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(3)));
    }

    @Test
    void registerWithTakenEmailIs409EvenWithDifferentCase() throws Exception {
        fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/auth/register").with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"CHRIS@example.com","password":"correct-horse-battery","displayName":"Chris"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/email-taken"));
    }

    // ---- login ----

    @Test
    void loginReturnsSessionAndProfilesWithNoActiveProfile() throws Exception {
        User user = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(user, "Personal", "PLN");
        fixtures.profile(user, "Company", "EUR");

        mockMvc.perform(login("chris@example.com", TestFixtures.DEFAULT_PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(user.getId()))
                .andExpect(jsonPath("$.user.email").value("chris@example.com"))
                .andExpect(jsonPath("$.user.displayName").value("Test User"))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.profiles", hasSize(2)))
                .andExpect(jsonPath("$.profiles[0].id").value(personal.getId()))
                .andExpect(jsonPath("$.profiles[0].name").value("Personal"))
                .andExpect(jsonPath("$.profiles[0].defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$.profiles[1].name").value("Company"))
                .andExpect(jsonPath("$.activeProfileId").value((Object) null))
                .andExpect(content().string(not(containsString("$2a$"))));
    }

    @Test
    void loginIsCaseInsensitiveOnEmail() throws Exception {
        fixtures.user("chris@example.com");
        mockMvc.perform(login("CHRIS@Example.com", TestFixtures.DEFAULT_PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("chris@example.com"));
    }

    @Test
    void loginSessionCarriesAuthenticationAcrossRequests() throws Exception {
        User user = fixtures.user("chris@example.com");
        MockHttpSession session = loginSession("chris@example.com");

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(user.getId()))
                .andExpect(jsonPath("$.activeProfileId").value((Object) null));

        // Same request without the session is rejected — the session is what carries the login.
        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void loginRotatesSessionIdAndClearsStaleActiveProfile() throws Exception {
        fixtures.user("chris@example.com");
        MockHttpSession preLogin = new MockHttpSession();
        preLogin.setAttribute(SessionActiveProfile.SESSION_KEY, 999L);
        String oldId = preLogin.getId();

        MvcResult result = mockMvc.perform(login("chris@example.com", TestFixtures.DEFAULT_PASSWORD).session(preLogin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value((Object) null))
                .andReturn();

        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        assertThat(session.getId()).isNotEqualTo(oldId);
        assertThat(session.getAttribute(SessionActiveProfile.SESSION_KEY)).isNull();
    }

    @Test
    void loginWithWrongPasswordAndUnknownEmailAreIndistinguishable401s() throws Exception {
        fixtures.user("chris@example.com");

        MvcResult wrongPassword = mockMvc.perform(login("chris@example.com", "definitely-wrong-password"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/bad-credentials"))
                .andReturn();

        MvcResult unknownEmail = mockMvc.perform(login("nobody@example.com", TestFixtures.DEFAULT_PASSWORD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("/errors/bad-credentials"))
                .andReturn();

        assertThat(unknownEmail.getResponse().getContentAsString())
                .isEqualTo(wrongPassword.getResponse().getContentAsString());
        assertThat(wrongPassword.getRequest().getSession(false)).isNull();
    }

    @Test
    void loginRejectsBlankFieldsWith400() throws Exception {
        mockMvc.perform(login("", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    // ---- logout ----

    @Test
    void logoutEndsTheSession() throws Exception {
        fixtures.user("chris@example.com");
        MockHttpSession session = loginSession("chris@example.com");
        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/logout").session(session).with(CSRF))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }

    // ---- me ----

    @Test
    void meWithoutSessionIs401() throws Exception {
        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void meReportsActiveProfileOnceSelected() throws Exception {
        User user = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(user, "Personal", "PLN");
        MockHttpSession session = loginSession("chris@example.com");

        mockMvc.perform(put("/api/auth/active-profile").session(session).with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + personal.getId() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value(personal.getId()))
                .andExpect(jsonPath("$.profile.id").value(personal.getId()))
                .andExpect(jsonPath("$.profile.name").value("Personal"))
                .andExpect(jsonPath("$.profile.defaultCurrency").value("PLN"));

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value(personal.getId()))
                .andExpect(jsonPath("$.profiles", hasSize(1)));
    }

    // ---- active-profile: the hinge of the scoping model ----

    @Test
    void switchingToAnotherUsersProfileIs404AndLeavesSessionUnchanged() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile chrisProfile = fixtures.profile(chris, "Personal", "PLN");
        User mallory = fixtures.user("mallory@example.com");
        Profile malloryProfile = fixtures.profile(mallory, "Personal", "PLN");

        MockHttpSession session = loginSession("chris@example.com");
        mockMvc.perform(put("/api/auth/active-profile").session(session).with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + chrisProfile.getId() + "}"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/auth/active-profile").session(session).with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + malloryProfile.getId() + "}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));

        assertThat(session.getAttribute(SessionActiveProfile.SESSION_KEY)).isEqualTo(chrisProfile.getId());
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(jsonPath("$.activeProfileId").value(chrisProfile.getId()));
    }

    @Test
    void switchingToNonexistentProfileIs404() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/auth/active-profile").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":424242}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void switchingWithoutProfileIdIs400() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/auth/active-profile").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void switchingUnauthenticatedIs401() throws Exception {
        mockMvc.perform(put("/api/auth/active-profile").with(CSRF)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":1}"))
                .andExpect(status().isUnauthorized());
    }

    // ---- helpers ----

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder login(String email, String password) {
        return post("/api/auth/login").with(CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    private MockHttpSession loginSession(String email) throws Exception {
        MvcResult result = mockMvc.perform(login(email, TestFixtures.DEFAULT_PASSWORD))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(session).as("login must create a session").isNotNull();
        return session;
    }
}

package com.myfinance.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.myfinance.backend.dto.SetPasswordRequest;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.ActiveProfile;
import com.myfinance.backend.security.AppUserDetails;
import com.myfinance.backend.service.AuthService;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

@IntegrationTest
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuthService authService;

    // ---- register ----

    @Test
    void registerCreatesUserAndLowercasesEmail() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .with(TestFixtures.csrf())
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
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"chris@example.com","password":"correct-horse-battery","displayName":"Chris"}
                                """))
                .andExpect(status().isCreated())
                .andReturn();

        String sessionId = fixtures.sessionIdFromResponse(result.getResponse());
        var me = get("/api/auth/me");
        if (sessionId != null) {
            me = me.with(fixtures.withSession(sessionId));
        }
        mockMvc.perform(me).andExpect(status().isUnauthorized());
    }

    @Test
    void registerRejectsInvalidBodyWith400() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .with(TestFixtures.csrf())
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
    void registerAcceptsA72BytePasswordButRejects73Bytes() throws Exception {
        mockMvc.perform(register("chris@example.com", "a".repeat(72))).andExpect(status().isCreated());
        mockMvc.perform(register("other@example.com", "a".repeat(73)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("passwordWithinBcryptLimit"));
    }

    @Test
    void registerRejectsPasswordOver72BytesEvenIfUnder128Chars() throws Exception {
        // 30 emoji: 30 chars (passes @Size) but 120 UTF-8 bytes (BCrypt would truncate).
        mockMvc.perform(register("chris@example.com", "\uD83D\uDD12".repeat(30)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("passwordWithinBcryptLimit"));
    }

    @Test
    void registerWithTakenEmailIs409EvenWithDifferentCase() throws Exception {
        fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/auth/register")
                        .with(TestFixtures.csrf())
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
        String session = loginSession("chris@example.com");

        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(session)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(user.getId()))
                .andExpect(jsonPath("$.activeProfileId").value((Object) null));

        // Same request without the session is rejected — the session is what carries the login.
        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void loginRotatesSessionIdAndClearsStaleActiveProfile() throws Exception {
        fixtures.user("chris@example.com");
        // A pre-existing session with a stale active-profile id, exactly as a session-fixation
        // attempt would look: attacker-known id, planted before the victim authenticates.
        String oldId = fixtures.createSessionWithActiveProfile(999L);

        MvcResult result = mockMvc.perform(login("chris@example.com", TestFixtures.DEFAULT_PASSWORD)
                        .with(fixtures.withSession(oldId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value((Object) null))
                .andReturn();

        String newId = fixtures.sessionIdFromResponse(result.getResponse());
        assertThat(newId).isNotNull().isNotEqualTo(oldId);
        Session newSession = fixtures.findSession(newId);
        assertThat(newSession).isNotNull();
        assertThat(newSession.<Long>getAttribute(ActiveProfile.SESSION_KEY)).isNull();
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
        String session = loginSession("chris@example.com");
        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(session))).andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/logout")
                        .with(fixtures.withSession(session))
                        .with(TestFixtures.csrf()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(session))).andExpect(status().isUnauthorized());
    }

    // ---- me ----

    @Test
    void meWithoutSessionIs401() throws Exception {
        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void meReportsPasswordAuthentication() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(get("/api/auth/me").with(fixtures.as(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authMode").value("PASSWORD"));
    }

    @Test
    void meReportsActiveProfileOnceSelected() throws Exception {
        User user = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(user, "Personal", "PLN");
        String session = loginSession("chris@example.com");

        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.withSession(session))
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + personal.getId() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value(personal.getId()))
                .andExpect(jsonPath("$.profile.id").value(personal.getId()))
                .andExpect(jsonPath("$.profile.name").value("Personal"))
                .andExpect(jsonPath("$.profile.defaultCurrency").value("PLN"));

        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(session)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value(personal.getId()))
                .andExpect(jsonPath("$.profiles", hasSize(1)));
    }

    @Test
    void meReturnsNullActiveProfileWhenItWasDeletedFromAnotherSession() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        fixtures.profile(chris, "Company", "EUR"); // keeps "Personal" from being the last profile

        String sessionA = loginSession("chris@example.com");
        String sessionB = loginSession("chris@example.com");

        // Two devices/tabs on the same account both pick the same profile.
        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.withSession(sessionA))
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + personal.getId() + "}"))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.withSession(sessionB))
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + personal.getId() + "}"))
                .andExpect(status().isOk());

        // Session A deletes the profile out from under session B.
        mockMvc.perform(delete("/api/profiles/{id}", personal.getId())
                        .with(fixtures.withSession(sessionA))
                        .with(TestFixtures.csrf()))
                .andExpect(status().isNoContent());

        // Session B's stored active-profile id is now dangling; /auth/me must self-heal to null
        // rather than reporting a profile that no longer exists.
        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(sessionB)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeProfileId").value((Object) null))
                .andExpect(jsonPath("$.profiles", hasSize(1)));
    }

    // ---- active-profile: the hinge of the scoping model ----

    @Test
    void switchingToAnotherUsersProfileIs404AndLeavesSessionUnchanged() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile chrisProfile = fixtures.profile(chris, "Personal", "PLN");
        User mallory = fixtures.user("mallory@example.com");
        Profile malloryProfile = fixtures.profile(mallory, "Personal", "PLN");

        String session = loginSession("chris@example.com");
        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.withSession(session))
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + chrisProfile.getId() + "}"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.withSession(session))
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + malloryProfile.getId() + "}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));

        Session storedSession = fixtures.findSession(session);
        assertThat(storedSession.<Long>getAttribute(ActiveProfile.SESSION_KEY)).isEqualTo(chrisProfile.getId());
        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(session)))
                .andExpect(jsonPath("$.activeProfileId").value(chrisProfile.getId()));
    }

    @Test
    void switchingToNonexistentProfileIs404() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":424242}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void switchingWithoutProfileIdIs400() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/auth/active-profile")
                        .with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void switchingUnauthenticatedIs401() throws Exception {
        mockMvc.perform(put("/api/auth/active-profile")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":1}"))
                .andExpect(status().isUnauthorized());
    }

    // ---- set password (passwordless instances only) ----

    @Test
    void setPasswordIs404InPasswordMode() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/auth/password")
                        .with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password":"another-long-password"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/passwordless-only"));
        assertThat(userRepository.findById(user.getId()).orElseThrow().getPasswordHash())
                .isEqualTo(user.getPasswordHash());
    }

    /**
     * Switching an instance from MYFINANCE_AUTH_MODE=none back to password. The mode is fixed per
     * application context, so the two halves run in two contexts: PasswordlessModeTest proves the
     * endpoint in none mode stores its hash through {@link AuthService#setPassword}; this test runs
     * that same method against the passwordless local account and then logs in over HTTP in
     * password mode.
     */
    @Test
    void aPasswordlessAccountThatSetAPasswordCanLogInAfterSwitchingToPasswordMode() throws Exception {
        User local = userRepository.save(User.passwordless("local@localhost", "Local"));
        AppUserDetails principal = new AppUserDetails(local);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
        try {
            authService.setPassword(new SetPasswordRequest("correct-horse-battery"));
        } finally {
            SecurityContextHolder.clearContext();
        }

        mockMvc.perform(login("local@localhost", "correct-horse-battery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("local@localhost"));
    }

    // ---- helpers ----

    private static MockHttpServletRequestBuilder register(String email, String password) {
        return post("/api/auth/register")
                .with(TestFixtures.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"displayName\":\"Chris\"}");
    }

    private static MockHttpServletRequestBuilder login(String email, String password) {
        return post("/api/auth/login")
                .with(TestFixtures.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    /** Returns the raw session id login created (not a cookie value — see {@link TestFixtures#withSession}). */
    private String loginSession(String email) throws Exception {
        MvcResult result = mockMvc.perform(login(email, TestFixtures.DEFAULT_PASSWORD))
                .andExpect(status().isOk())
                .andReturn();
        String sessionId = fixtures.sessionIdFromResponse(result.getResponse());
        assertThat(sessionId).as("login must create a session").isNotNull();
        return sessionId;
    }
}

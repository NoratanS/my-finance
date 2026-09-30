package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.service.LocalAccountService;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * End-to-end behavior of MYFINANCE_AUTH_MODE=none: no credentials anywhere in the request, and the
 * API answers as the local account. The password-mode half of each behavior is covered by the
 * existing SecurityConfigTest and AuthControllerTest, which run in the default mode.
 */
@IntegrationTest
@TestPropertySource(properties = "myfinance.auth.mode=none")
class PasswordlessModeTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private LocalAccountService localAccountService;

    @Test
    void theStartupCheckIsWiredToTheMode() {
        // The filter would create the account on its own, so the runner's real job is the ">1
        // accounts" refusal — which only ever fires at startup. A typo in the @ConditionalOnProperty
        // would silently cost exactly that, with every other test still green.
        assertThat(applicationContext.getBeansOfType(PasswordlessStartup.class)).hasSize(1);
    }

    @Test
    void anUnauthenticatedRequestIsServedAsTheLocalAccount() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("local@localhost"))
                .andExpect(jsonPath("$.activeProfileId").doesNotExist());
    }

    @Test
    void aScopedEndpointIsReachableWithoutLoggingIn() throws Exception {
        mockMvc.perform(get("/api/profiles")).andExpect(status().isOk());
    }

    @Test
    void theSessionResponseReportsTheMode() throws Exception {
        mockMvc.perform(get("/api/auth/me")).andExpect(jsonPath("$.authMode").value("NONE"));
    }

    @Test
    void aCookielessRequestLeavesNoSessionBehind() throws Exception {
        // docker-compose's healthcheck probes /api/auth/me every 5 s without a cookie; a session
        // per probe would pile up in the session store for the whole idle timeout.
        MvcResult result =
                mockMvc.perform(get("/api/auth/me")).andExpect(status().isOk()).andReturn();

        assertThat(fixtures.sessionIdFromResponse(result.getResponse())).isNull();
    }

    @Test
    void choosingAProfileStillStartsASessionThatKeepsIt() throws Exception {
        Profile profile = fixtures.profile(localAccountService.resolveLocalAccount(), "Personal", "PLN");

        MvcResult result = mockMvc.perform(put("/api/auth/active-profile")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"profileId\":" + profile.getId() + "}"))
                .andExpect(status().isOk())
                .andReturn();
        String sessionId = fixtures.sessionIdFromResponse(result.getResponse());
        assertThat(sessionId).isNotNull();

        mockMvc.perform(get("/api/auth/me").with(fixtures.withSession(sessionId)))
                .andExpect(jsonPath("$.activeProfileId").value(profile.getId()));
    }

    @Test
    void registerIsDisabled() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"someone@example.com","password":"correct-horse-battery","displayName":"Someone"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/auth-disabled"));
    }

    @Test
    void loginIsDisabled() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"local@localhost","password":"anything"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/auth-disabled"));
    }

    @Test
    void noSecondAccountIsEverCreated() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .with(TestFixtures.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"someone@example.com","password":"correct-horse-battery","displayName":"Someone"}
                        """));
        mockMvc.perform(get("/api/auth/me"));

        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void theLocalAccountCanSetAPassword() throws Exception {
        mockMvc.perform(setPassword("correct-horse-battery")).andExpect(status().isNoContent());

        String hash = userRepository
                .findByEmail(LocalAccountService.LOCAL_EMAIL)
                .orElseThrow()
                .getPasswordHash();
        assertThat(passwordEncoder.matches("correct-horse-battery", hash)).isTrue();
    }

    @Test
    void settingAPasswordAgainOverwritesTheOldOne() throws Exception {
        mockMvc.perform(setPassword("correct-horse-battery")).andExpect(status().isNoContent());
        mockMvc.perform(setPassword("another-long-password")).andExpect(status().isNoContent());

        String hash = userRepository
                .findByEmail(LocalAccountService.LOCAL_EMAIL)
                .orElseThrow()
                .getPasswordHash();
        assertThat(passwordEncoder.matches("another-long-password", hash)).isTrue();
    }

    @Test
    void aShortPasswordIsRejected() throws Exception {
        mockMvc.perform(setPassword("short"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("password"));
    }

    @Test
    void aPasswordOver72BytesIsRejected() throws Exception {
        // 30 emoji: 30 chars (passes @Size) but 120 UTF-8 bytes (BCrypt would truncate).
        mockMvc.perform(setPassword("\uD83D\uDD12".repeat(30)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("passwordWithinBcryptLimit"));
    }

    @Test
    void settingAPasswordNeedsTheCsrfToken() throws Exception {
        mockMvc.perform(put("/api/auth/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"password":"correct-horse-battery"}
                        """))
                .andExpect(status().isForbidden());
    }

    private static MockHttpServletRequestBuilder setPassword(String password) {
        return put("/api/auth/password")
                .with(TestFixtures.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"" + password + "\"}");
    }
}

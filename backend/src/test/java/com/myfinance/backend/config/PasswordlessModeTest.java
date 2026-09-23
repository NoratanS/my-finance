package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.repository.UserRepository;
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
}

package com.myfinance.backend.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.support.IntegrationTest;

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
}

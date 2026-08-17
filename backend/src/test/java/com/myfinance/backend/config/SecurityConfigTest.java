package com.myfinance.backend.config;

import com.myfinance.backend.model.User;
import com.myfinance.backend.security.AppUserDetails;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Test
    void unauthenticatedRequestGets401ProblemDetail() throws Exception {
        mockMvc.perform(get("/api/profiles"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/unauthenticated"))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void mutatingRequestWithoutCsrfTokenGets403ProblemDetail() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/profiles").with(user(new AppUserDetails(user)))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/forbidden"));
    }

    @Test
    void unsupportedMethodIs405ProblemDetail() throws Exception {
        // spring.mvc.problemdetails.enabled: framework errors use the same RFC 9457 shape as our handler.
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/profiles").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(405));
    }

    @Test
    void everyResponseCarriesTheXsrfCookie() throws Exception {
        mockMvc.perform(get("/api/profiles"))
                .andExpect(header().string("Set-Cookie", containsString("XSRF-TOKEN=")));
    }

    @Test
    void logoutIsIdempotentAndReturns204() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/auth/logout").with(fixtures.as(user)))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/logout").with(fixtures.as(user)))
                .andExpect(status().isNoContent());
    }
}

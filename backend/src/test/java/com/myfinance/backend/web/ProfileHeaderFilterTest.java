package com.myfinance.backend.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.support.IntegrationTest;

/**
 * Every request that changes something must carry the {@code X-Profile-Id} header, even with an
 * empty value (docs/API.md "Active profile: one header, resolved in one place"). A page of
 * another site can make a browser post a form here, but it cannot add a header without a
 * preflight, and no preflight is ever granted: the backend has no CORS configuration.
 */
@IntegrationTest
class ProfileHeaderFilterTest {

    private static final String PROFILE_HEADER = "X-Profile-Id";
    private static final String ELSEWHERE = "https://elsewhere.example";
    private static final String ONE_PROFILE_BACKUP = """
            {"app": "my-finance", "formatVersion": 1, "exportedAt": "2026-08-25T12:00:00Z",
             "profiles": [{"name": "Smuggled", "defaultCurrency": "PLN",
               "categories": [], "subscriptions": [], "transactions": [], "budgets": []}]}
            """;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void aChangingRequestWithoutTheHeaderIsRefusedBeforeItChangesAnything() throws Exception {
        mockMvc.perform(post("/api/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/profile-header-missing"))
                .andExpect(jsonPath("$.title").value("Profile header missing"))
                .andExpect(jsonPath("$.status").value(400));

        mockMvc.perform(get("/api/profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @ParameterizedTest
    @CsvSource({
        "POST, /api/categories",
        "PUT, /api/budgets/1",
        "PATCH, /api/categories/1",
        "DELETE, /api/transactions/1",
        "PUT, /api/profiles/1",
        "DELETE, /api/profiles/1",
        "POST, /api/backup/export"
    })
    void theRuleCoversEveryRequestThatIsNotARead(String method, String path) throws Exception {
        mockMvc.perform(request(HttpMethod.valueOf(method), path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/profile-header-missing"));
    }

    /** The request a form on another site can make a browser send: a file upload, no custom header. */
    @Test
    void backupRestoreWithoutTheHeaderIsRefused() throws Exception {
        mockMvc.perform(multipart("/api/backup/restore")
                        .file(new MockMultipartFile(
                                "file",
                                "backup.json",
                                MediaType.APPLICATION_JSON_VALUE,
                                ONE_PROFILE_BACKUP.getBytes(StandardCharsets.UTF_8)))
                        .header("Origin", ELSEWHERE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/profile-header-missing"));

        mockMvc.perform(get("/api/profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void anEmptyHeaderIsEnough() throws Exception {
        mockMvc.perform(post("/api/profiles")
                        .header(PROFILE_HEADER, "")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void aReadWithoutTheHeaderIsNotRefusedByThisRule() throws Exception {
        mockMvc.perform(get("/api/profiles")).andExpect(status().isOk());
        // Profile-scoped: it has no active profile, which is a different answer.
        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    /**
     * What a browser sends before a cross-origin request that carries the header. Spring MVC
     * answers the OPTIONS request, but with no CORS configuration it adds no
     * {@code Access-Control-Allow-*} header, and without one the browser never sends the request
     * itself.
     */
    @Test
    void aPreflightFromAnotherOriginIsNotGranted() throws Exception {
        mockMvc.perform(options("/api/backup/restore")
                        .header("Origin", ELSEWHERE)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "x-profile-id"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Methods"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Headers"));
    }
}

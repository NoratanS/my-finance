package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.support.IntegrationTest;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The OpenAPI document the application serves is the checked statement of the API's request and
 * response shapes (ARCHITECTURE.md "OpenAPI document and the Jackson 2/3 split"). A copy is
 * committed as docs/openapi.json; this test fails when the served document differs from it, so a
 * wire-contract change cannot land without appearing as a diff of that file.
 */
@IntegrationTest
class OpenApiDocumentTest {

    /** Relative to the backend module directory, Maven's working directory for tests. */
    private static final Path COMMITTED = Path.of("../docs/openapi.json");

    private static final Path SERVED = Path.of("target/openapi.json");

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Test
    void servedDocumentEqualsTheCommittedOne() throws Exception {
        byte[] served = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
        Files.createDirectories(SERVED.getParent());
        Files.write(SERVED, served);

        String update = "Review backend/target/openapi.json, copy it over docs/openapi.json, then run"
                + " `npm run generate:types` in frontend/.";
        assertThat(Files.exists(COMMITTED))
                .withFailMessage(
                        "No committed OpenAPI document at %s. %s",
                        COMMITTED.toAbsolutePath().normalize(), update)
                .isTrue();
        JsonNode servedTree = jsonMapper.readTree(served);
        JsonNode committedTree = jsonMapper.readTree(COMMITTED.toFile());
        // Tree equality: object key order and whitespace don't matter, array order does.
        assertThat(servedTree.equals(committedTree))
                .withFailMessage("The served OpenAPI document differs from docs/openapi.json. %s", update)
                .isTrue();
    }
}

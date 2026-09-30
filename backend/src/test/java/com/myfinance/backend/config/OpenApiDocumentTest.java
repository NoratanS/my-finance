package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
        byte[] served = fetchServedDocument();
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

    @Test
    void moneyIsNeverDocumentedAsAJsonNumber() throws Exception {
        List<String> bareNumbers = new ArrayList<>();
        collectBareNumbers(jsonMapper.readTree(fetchServedDocument()), "", bareNumbers);

        // A number without a format is how swagger-core documents a BigDecimal it wasn't told is
        // money (docs/API.md "Money"); counts and ratios carry a format (int32, int64, double).
        assertThat(bareNumbers)
                .as("schemas documented as a JSON number without a format")
                .isEmpty();
    }

    private byte[] fetchServedDocument() throws Exception {
        return mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
    }

    private static void collectBareNumbers(JsonNode node, String path, List<String> found) {
        if (node.isObject()) {
            if (isNumberType(node.path("type")) && !node.has("format")) {
                found.add(path);
            }
            for (Map.Entry<String, JsonNode> child : node.properties()) {
                collectBareNumbers(child.getValue(), path + "/" + child.getKey(), found);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                collectBareNumbers(node.get(i), path + "/" + i, found);
            }
        }
    }

    /** OpenAPI 3.1 writes a type as a string, or as an array when the schema is nullable. */
    private static boolean isNumberType(JsonNode type) {
        if (type.isArray()) {
            for (JsonNode each : type) {
                if (isNumberType(each)) {
                    return true;
                }
            }
            return false;
        }
        return type.isString() && type.asString().equals("number");
    }
}

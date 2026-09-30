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

    @Test
    void plansVizAndExecutionBodiesAreFreeFormJsonObjects() throws Exception {
        JsonNode document = jsonMapper.readTree(fetchServedDocument());
        JsonNode schemas = document.path("components").path("schemas");

        // The backend never reads a plan's structure (docs/API.md "Insights"), so the document
        // must not describe the internals of the Java type that holds it.
        assertThat(schemas.has("JsonNode"))
                .as("a JsonNode schema in the document")
                .isFalse();
        for (String insightRecord : List.of("InsightRequest", "InsightResponse")) {
            JsonNode properties = schemas.path(insightRecord).path("properties");
            assertThat(types(properties.path("plan")))
                    .as(insightRecord + ".plan")
                    .containsExactly("object");
            assertThat(properties.path("plan").path("additionalProperties").asBoolean())
                    .as(insightRecord + ".plan allows any property")
                    .isTrue();
            assertThat(types(properties.path("viz")))
                    .as(insightRecord + ".viz")
                    .containsExactlyInAnyOrder("object", "null");
            assertThat(properties.path("viz").path("additionalProperties").asBoolean())
                    .as(insightRecord + ".viz allows any property")
                    .isTrue();
        }

        JsonNode execute = document.path("paths").path("/api/insights/execute").path("post");
        JsonNode requestSchema = onlyContentSchema(execute.path("requestBody").path("content"));
        JsonNode responseSchema =
                onlyContentSchema(execute.path("responses").path("200").path("content"));
        for (JsonNode body : List.of(requestSchema, responseSchema)) {
            assertThat(types(body)).as("an execution body").containsExactly("object");
            assertThat(body.path("additionalProperties").asBoolean())
                    .as("an execution body allows any property")
                    .isTrue();
        }
    }

    @Test
    void everyFieldOfASuccessResponseIsRequired() throws Exception {
        JsonNode schemas =
                jsonMapper.readTree(fetchServedDocument()).path("components").path("schemas");

        // Jackson writes every record component, nulls included: a response field is always present.
        for (String responseRecord : List.of("TransactionResponse", "CategoryNode", "SessionResponse")) {
            JsonNode schema = schemas.path(responseRecord);
            assertThat(names(schema.path("required")))
                    .as(responseRecord + " required")
                    .containsExactlyInAnyOrderElementsOf(propertyNames(schema))
                    .isNotEmpty();
        }
        // The self-reference the walk must survive.
        assertThat(schemas.at("/CategoryNode/properties/children/items/$ref").asString())
                .isEqualTo("#/components/schemas/CategoryNode");
    }

    @Test
    void successResponseFieldsThatCanBeNullSaySo() throws Exception {
        JsonNode schemas =
                jsonMapper.readTree(fetchServedDocument()).path("components").path("schemas");

        JsonNode transaction = schemas.path("TransactionResponse").path("properties");
        for (String field : List.of("description", "merchant", "subscriptionId")) {
            assertThat(types(transaction.path(field)))
                    .as("TransactionResponse." + field)
                    .contains("null");
        }
        assertThat(types(transaction.path("amount")))
                .as("TransactionResponse.amount")
                .doesNotContain("null");

        JsonNode category = schemas.path("CategoryNode").path("properties");
        for (String field : List.of("parentId", "color")) {
            assertThat(types(category.path(field))).as("CategoryNode." + field).contains("null");
        }
        assertThat(types(schemas.at("/SessionResponse/properties/activeProfileId")))
                .as("SessionResponse.activeProfileId")
                .contains("null");
    }

    @Test
    void requestBodiesKeepTheRequiredFieldsBeanValidationGivesThem() throws Exception {
        JsonNode schemas =
                jsonMapper.readTree(fetchServedDocument()).path("components").path("schemas");

        // An absent request field is legitimate; only @NotNull/@NotBlank make one required.
        assertThat(names(schemas.at("/TransactionRequest/required")))
                .containsExactlyInAnyOrder("categoryId", "amount", "currency", "type", "occurredOn");
    }

    @Test
    void successResponsesAreDocumentedAsJson() throws Exception {
        JsonNode paths = jsonMapper.readTree(fetchServedDocument()).path("paths");

        List<String> mediaTypes = new ArrayList<>();
        for (JsonNode pathItem : paths) {
            for (JsonNode operation : pathItem) {
                for (Map.Entry<String, JsonNode> response :
                        operation.path("responses").properties()) {
                    if (response.getKey().startsWith("2")) {
                        mediaTypes.addAll(propertyNamesOf(response.getValue().path("content")));
                    }
                }
            }
        }
        assertThat(mediaTypes).isNotEmpty().containsOnly("application/json");
    }

    private byte[] fetchServedDocument() throws Exception {
        return mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
    }

    /** A schema's {@code type}: one name, or several when the schema is nullable (OpenAPI 3.1). */
    private static List<String> types(JsonNode schema) {
        JsonNode type = schema.path("type");
        if (type.isArray()) {
            return names(type);
        }
        return type.isString() ? List.of(type.asString()) : List.of();
    }

    private static List<String> propertyNames(JsonNode schema) {
        return propertyNamesOf(schema.path("properties"));
    }

    private static List<String> propertyNamesOf(JsonNode object) {
        List<String> names = new ArrayList<>();
        object.properties().forEach(entry -> names.add(entry.getKey()));
        return names;
    }

    private static List<String> names(JsonNode array) {
        List<String> names = new ArrayList<>();
        array.forEach(each -> names.add(each.asString()));
        return names;
    }

    private static JsonNode onlyContentSchema(JsonNode content) {
        assertThat(content.size()).as("media types in %s", content).isEqualTo(1);
        return content.iterator().next().path("schema");
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

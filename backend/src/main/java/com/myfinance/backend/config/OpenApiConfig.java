package com.myfinance.backend.config;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.servers.Server;
import tools.jackson.databind.JsonNode;

/**
 * Serves the OpenAPI 3.1 document (springdoc, at {@code /v3/api-docs}) and Swagger UI (at
 * {@code /swagger-ui.html}) for the {@code /api/**} surface documented in docs/API.md. A copy is
 * committed as docs/openapi.json and checked against the served one by {@code OpenApiDocumentTest}.
 */
@Configuration
public class OpenApiConfig {

    // Schemas stated once per Java type, wherever it appears in a request or response.
    // SpringDocUtils is a static registry read while the document is generated, so the
    // registrations sit in a static initializer: they are in place before any document is built.
    static {
        SpringDocUtils.getConfig()
                // springdoc introspects DTOs through its own Jackson 2 pass, blind to JacksonConfig's
                // Jackson 3 rule that writes every BigDecimal as a string; left alone it documents
                // money as a bare number.
                .replaceWithSchema(
                        BigDecimal.class, new StringSchema().format("decimal").example("243.5000"))
                // Plans, viz and the executor's results are Jackson 3 JsonNodes, which the Jackson 2
                // pass would describe as a bean of JsonNode getters. On the wire they are JSON objects
                // whose structure the plan executor owns.
                .replaceWithSchema(
                        JsonNode.class,
                        new ObjectSchema()
                                .additionalProperties(true)
                                .description("A JSON object whose structure the plan executor defines;"
                                        + " see docs/API.md \"Insights\"."));
    }

    @Bean
    OpenAPI myFinanceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("my-finance API")
                        .version("0.0.1")
                        .description("Personal finance tracker backend: accounts, transactions, "
                                + "budgets, subscriptions, and insights."))
                // A relative server, so the document never names the host it was fetched from
                // (springdoc would otherwise add the request's base URL).
                .servers(List.of(new Server().url("/")));
    }

    /**
     * Every property of every schema reachable from a success (2xx) response is required: Jackson
     * writes every record component, {@code null}s included (no property inclusion is configured),
     * so a response field is always present. Whether it may be {@code null} is stated separately,
     * with {@code @Schema(nullable = true)} on the record component. Request schemas are not
     * touched — their required lists come from Bean Validation, because an absent request field is
     * legitimate. So a record must never serve both as a request body and inside a response body.
     */
    @Bean
    OpenApiCustomizer successResponseFieldsAreRequired() {
        return openApi -> {
            Map<String, Schema> components = openApi.getComponents().getSchemas();
            Set<String> visited = new HashSet<>();
            openApi.getPaths().values().stream()
                    .flatMap(pathItem -> pathItem.readOperations().stream())
                    .flatMap(operation -> operation.getResponses().entrySet().stream())
                    .filter(response -> response.getKey().startsWith("2"))
                    .map(response -> response.getValue().getContent())
                    .filter(Objects::nonNull)
                    .flatMap(content -> content.values().stream())
                    .forEach(mediaType -> requireAllProperties(mediaType.getSchema(), components, visited));
        };
    }

    /** {@code visited} holds component names: {@code CategoryNode} refers to itself through {@code children}. */
    private static void requireAllProperties(Schema<?> schema, Map<String, Schema> components, Set<String> visited) {
        if (schema == null) {
            return;
        }
        if (schema.get$ref() != null) {
            String name = schema.get$ref().substring(schema.get$ref().lastIndexOf('/') + 1);
            if (visited.add(name)) {
                requireAllProperties(components.get(name), components, visited);
            }
            return;
        }
        if (schema.getProperties() != null) {
            schema.setRequired(new ArrayList<>(schema.getProperties().keySet()));
            schema.getProperties().values().forEach(property -> requireAllProperties(property, components, visited));
        }
        requireAllProperties(schema.getItems(), components, visited);
        if (schema.getAdditionalProperties() instanceof Schema<?> valueSchema) {
            requireAllProperties(valueSchema, components, visited);
        }
    }
}

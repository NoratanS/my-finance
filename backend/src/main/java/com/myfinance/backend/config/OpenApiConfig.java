package com.myfinance.backend.config;

import java.math.BigDecimal;
import java.util.List;

import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ObjectSchema;
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
}

package com.myfinance.backend.config;

import java.math.BigDecimal;
import java.util.List;

import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.servers.Server;

/**
 * Serves the OpenAPI 3.1 document (springdoc, at {@code /v3/api-docs}) and Swagger UI (at
 * {@code /swagger-ui.html}) for the {@code /api/**} surface documented in docs/API.md. A copy is
 * committed as docs/openapi.json and checked against the served one by {@code OpenApiDocumentTest}.
 */
@Configuration
public class OpenApiConfig {

    // springdoc introspects DTOs through its own Jackson 2 pass, blind to JacksonConfig's Jackson 3
    // rule that writes every BigDecimal as a string; left alone it documents money as a bare
    // number. This states money's schema once, for every BigDecimal in any request or response.
    // SpringDocUtils is a static registry read while the document is generated, so the
    // registration sits in a static initializer: it is in place before any document is built.
    static {
        SpringDocUtils.getConfig()
                .replaceWithSchema(
                        BigDecimal.class, new StringSchema().format("decimal").example("243.5000"));
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

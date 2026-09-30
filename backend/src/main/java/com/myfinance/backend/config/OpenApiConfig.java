package com.myfinance.backend.config;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;

/**
 * Serves the OpenAPI 3.1 document (springdoc, at {@code /v3/api-docs}) and Swagger UI (at
 * {@code /swagger-ui.html}) for the {@code /api/**} surface documented in docs/API.md. A copy is
 * committed as docs/openapi.json and checked against the served one by {@code OpenApiDocumentTest}.
 */
@Configuration
public class OpenApiConfig {

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

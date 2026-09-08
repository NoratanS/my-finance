package com.myfinance.backend.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Serves the OpenAPI 3.1 schema (springdoc, at {@code /v3/api-docs}) and Swagger UI (at
 * {@code /swagger-ui.html}) for the {@code /api/**} surface documented in docs/API.md.
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
                                + "budgets, subscriptions, and insights."));
    }
}

package com.myfinance.backend.config;

import com.fasterxml.jackson.annotation.JsonFormat;
import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.DeserializationFeature;

import java.math.BigDecimal;

/**
 * Money is a decimal string in JSON (docs/API.md "Money"): JSON numbers are IEEE doubles in
 * JavaScript, so {@code 34.9900} would arrive as {@code 34.99} and lose its scale (or worse,
 * precision). Setting the shape once here, for every {@link BigDecimal}, replaces a
 * {@code @JsonFormat(shape = STRING)} on each money field of each response DTO.
 */
@Configuration
public class JacksonConfig {

    @Bean
    JsonMapperBuilderCustomizer bigDecimalAsString() {
        return builder -> builder.withConfigOverride(BigDecimal.class,
                override -> override.setFormat(JsonFormat.Value.forShape(JsonFormat.Shape.STRING)));
    }

    /**
     * Jackson 3 defaults {@code FAIL_ON_NULL_FOR_PRIMITIVES} to {@code true}, so a record with an
     * optional primitive field (e.g. {@code InsightRequest.pinned}) rejects a request that simply
     * omits it, instead of defaulting to {@code 0}/{@code false} like every other missing,
     * non-{@code @NotNull} field. Disabled app-wide so "optional field, primitive type" behaves the
     * same as "optional field, wrapper type".
     */
    @Bean
    JsonMapperBuilderCustomizer allowMissingPrimitives() {
        return builder -> builder.disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES);
    }
}

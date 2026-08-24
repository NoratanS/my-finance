package com.myfinance.backend.config;

import com.fasterxml.jackson.annotation.JsonFormat;
import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
}

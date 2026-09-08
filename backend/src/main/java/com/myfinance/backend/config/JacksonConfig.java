package com.myfinance.backend.config;

import java.math.BigDecimal;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.HttpMessageConverters;
import org.springframework.http.converter.json.AbstractJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.fasterxml.jackson.annotation.JsonFormat;

import tools.jackson.databind.module.SimpleModule;

/**
 * Money is a decimal string in JSON (docs/API.md "Money"): JSON numbers are IEEE doubles in
 * JavaScript, so {@code 34.9900} would arrive as {@code 34.99} and lose its scale (or worse,
 * precision). Setting the shape once here, for every {@link BigDecimal}, replaces a
 * {@code @JsonFormat(shape = STRING)} on each money field of each response DTO, and the
 * deserializer below enforces the same rule on the way in, rejecting a JSON number with a 400
 * instead of silently accepting a value that may already have lost precision in the client.
 */
@Configuration
public class JacksonConfig {

    @Bean
    JsonMapperBuilderCustomizer bigDecimalAsString() {
        return builder -> {
            builder.withConfigOverride(
                    BigDecimal.class,
                    override -> override.setFormat(JsonFormat.Value.forShape(JsonFormat.Shape.STRING)));
            builder.addModule(
                    new SimpleModule().addDeserializer(BigDecimal.class, new StrictStringBigDecimalDeserializer()));
        };
    }

    /**
     * Keeps Jackson 2 out of the MVC chain. springdoc needs {@code jackson-dataformat-yaml} 2.x on
     * the compile classpath — its {@code ObjectMapperProvider} builds a YAML mapper eagerly at
     * startup, so the dependency cannot simply be excluded — and Spring, finding no Jackson 3
     * YAML mapper, auto-detects that jar and registers a {@code MappingJackson2YamlHttpMessageConverter}.
     * No controller declares {@code produces}, so {@code Accept: application/yaml} on any endpoint
     * would then serialize through a Jackson 2 mapper carrying none of the rules above: money as a
     * bare number out, and an {@code application/yaml} request body bypassing
     * {@link StrictStringBigDecimalDeserializer} on the way in. Dropping the converter makes those
     * requests a plain 406 instead. {@code /v3/api-docs.yaml} is unaffected — springdoc writes that
     * response itself, through its own mapper, not through this list.
     *
     * <p>{@code ArchitectureTest.noJackson2Databind} cannot catch this: the converter arrives by
     * framework auto-detection, with no app class importing it. {@code HttpMessageConverterTest}
     * asserts the resulting converter list instead.
     */
    @Bean
    WebMvcConfigurer jackson2ConverterRemover() {
        return new WebMvcConfigurer() {
            @Override
            public void configureMessageConverters(HttpMessageConverters.ServerBuilder builder) {
                builder.configureMessageConvertersList(
                        converters -> converters.removeIf(c -> c instanceof AbstractJackson2HttpMessageConverter));
            }
        };
    }
}

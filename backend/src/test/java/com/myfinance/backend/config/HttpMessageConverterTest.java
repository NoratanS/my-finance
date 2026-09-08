package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter;

import com.myfinance.backend.support.TestcontainersConfiguration;

/**
 * The companion to {@code ArchitectureTest.noJackson2Databind}, which an import rule structurally
 * cannot cover: a Jackson 2 converter can enter the MVC chain with no app class importing it.
 * Spring builds the converter list by classpath auto-detection, and springdoc drags Jackson 2
 * (databind and dataformat-yaml) in transitively — so Spring will happily register, say,
 * {@code MappingJackson2YamlHttpMessageConverter} for {@code Accept: application/yaml} on any
 * endpoint. That converter carries none of {@link JacksonConfig}'s rules: money would go out as a
 * bare number and an inbound YAML body would bypass {@link StrictStringBigDecimalDeserializer}.
 * This asserts the shipped converter list instead of the imports.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class HttpMessageConverterTest {

    @Autowired
    private RequestMappingHandlerAdapter handlerAdapter;

    @Test
    void noJackson2ConverterIsRegisteredInTheMvcChain() {
        List<String> jackson2 = handlerAdapter.getMessageConverters().stream()
                .map(HttpMessageConverter::getClass)
                .map(Class::getName)
                .filter(name -> name.contains("Jackson2") || name.startsWith("com.fasterxml.jackson"))
                .toList();

        assertThat(jackson2)
                .as("Jackson 2 converters in the MVC chain — they carry none of JacksonConfig's rules")
                .isEmpty();
    }

    /** Guards the rule above against passing vacuously if Jackson leaves the chain altogether. */
    @Test
    void theJackson3ConverterIsRegistered() {
        List<String> jackson3 = handlerAdapter.getMessageConverters().stream()
                .map(HttpMessageConverter::getClass)
                .map(Class::getName)
                .filter(name -> name.contains("Jackson"))
                .toList();

        assertThat(jackson3).anyMatch(name -> name.contains("JacksonJsonHttpMessageConverter"));
    }
}

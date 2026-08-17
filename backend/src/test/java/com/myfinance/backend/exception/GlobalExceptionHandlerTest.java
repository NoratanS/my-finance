package com.myfinance.backend.exception;

import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Plain unit test: the handler is a POJO, so the mapping rules can be checked without a Spring context. */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void dataIntegrityViolationIs409Conflict() {
        ProblemDetail problem = handler.handleConflict();

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/conflict"));
    }

    @Test
    void unexpectedExceptionIs500WithFixedDetail() {
        ResponseEntity<ProblemDetail> response = handler.handleUnexpected(
                new IllegalStateException("something with internals: jdbc:postgresql://..."));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        ProblemDetail problem = response.getBody();
        assertThat(problem).isNotNull();
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/internal"));
        assertThat(problem.getTitle()).isEqualTo("Internal server error");
        assertThat(problem.getDetail()).isEqualTo("An unexpected error occurred.");
    }

    @Test
    void frameworkErrorResponsesKeepTheirOwnStatus() {
        // 405 etc. are handled by Boot's advice normally; the catch-all must not turn them into 500s.
        ResponseEntity<ProblemDetail> response = handler.handleUnexpected(
                new HttpRequestMethodNotSupportedException("PUT", List.of("GET", "POST")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getHeaders().getAllow()).hasSize(2);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getStatus()).isEqualTo(405);
    }

    @Test
    void validationFailureListsEveryFieldError() throws NoSuchMethodException {
        record Body(String name, Integer age) {
        }
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(new Body("", null), "body");
        binding.rejectValue("name", "NotBlank", "must not be blank");
        binding.rejectValue("age", "NotNull", "must not be null");
        MethodParameter parameter = new MethodParameter(
                GlobalExceptionHandlerTest.class.getDeclaredMethod("sampleEndpoint", Object.class), 0);

        ProblemDetail problem = handler.handleValidation(new MethodArgumentNotValidException(parameter, binding));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/validation-failed"));
        assertThat(problem.getDetail()).isEqualTo("The request body has 2 invalid field(s).");
        assertThat(problem.getProperties()).containsKey("errors");
        assertThat(problem.getProperties().get("errors"))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.LIST)
                .containsExactly(
                        new GlobalExceptionHandler.FieldViolation("name", "must not be blank"),
                        new GlobalExceptionHandler.FieldViolation("age", "must not be null"));
    }

    @SuppressWarnings("unused") // only its MethodParameter is needed to build the exception
    void sampleEndpoint(Object body) {
    }
}

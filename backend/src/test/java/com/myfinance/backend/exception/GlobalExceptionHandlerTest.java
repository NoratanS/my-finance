package com.myfinance.backend.exception;

import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.InstanceOfAssertFactories.LIST;

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
        ProblemDetail problem = handler.handleUnexpected(
                new IllegalStateException("something with internals: jdbc:postgresql://..."));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/internal"));
        assertThat(problem.getTitle()).isEqualTo("Internal server error");
        assertThat(problem.getDetail()).isEqualTo("An unexpected error occurred.");
    }

    @Test
    void maxUploadSizeExceededIs413BackupTooLarge() {
        // The servlet container enforces spring.servlet.multipart.max-file-size and throws before
        // any controller runs, so the mapping is unit-tested here — MockMvc bypasses that parsing.
        ResponseEntity<Object> response = handler.handleMaxUploadSizeExceededException(
                new MaxUploadSizeExceededException(20 * 1024 * 1024), new HttpHeaders(),
                HttpStatus.CONTENT_TOO_LARGE, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
        ProblemDetail problem = (ProblemDetail) response.getBody();
        assertThat(problem).isNotNull();
        assertThat(problem.getStatus()).isEqualTo(413);
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/backup-too-large"));
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

        ResponseEntity<Object> response = handler.handleMethodArgumentNotValid(
                new MethodArgumentNotValidException(parameter, binding), new HttpHeaders(), HttpStatus.BAD_REQUEST, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        ProblemDetail problem = (ProblemDetail) response.getBody();
        assertThat(problem).isNotNull();
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/validation-failed"));
        assertThat(problem.getDetail()).isEqualTo("The request body has 2 invalid field(s).");
        assertThat(problem.getProperties()).extractingByKey("errors").asInstanceOf(LIST)
                .containsExactly(
                        new GlobalExceptionHandler.FieldViolation("name", "must not be blank"),
                        new GlobalExceptionHandler.FieldViolation("age", "must not be null"));
    }

    @SuppressWarnings("unused") // only its MethodParameter is needed to build the exception
    void sampleEndpoint(Object body) {
    }
}

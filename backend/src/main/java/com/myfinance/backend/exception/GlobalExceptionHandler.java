package com.myfinance.backend.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.util.List;

/**
 * Maps exceptions to RFC 9457 Problem Details (docs/API.md "Errors").
 * Domain failures extend {@link ApiException} and carry their own status/type;
 * the remaining handlers cover framework exceptions for malformed input. Anything not handled
 * here (405, 415, ...) falls through to Boot's {@code ProblemDetailsExceptionHandler}
 * ({@code spring.mvc.problemdetails.enabled}), which is {@code @Order(0)} — hence the explicit
 * higher precedence so our {@code type}/{@code errors} members win for the exceptions we own.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ProblemDetail handleApiException(ApiException ex, HttpServletRequest request) {
        ProblemDetail problem = ex.toProblemDetail();
        problem.setInstance(URI.create(request.getRequestURI()));
        return problem;
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ProblemDetail handleBadCredentials() {
        // Deliberately does not distinguish unknown email from wrong password.
        return problem(HttpStatus.UNAUTHORIZED, "bad-credentials", "Bad credentials", "Invalid email or password.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        List<FieldViolation> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldViolation::of)
                .toList();
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "validation-failed", "Validation failed",
                "The request body has " + errors.size() + " invalid field(s).");
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class,
            HandlerMethodValidationException.class
    })
    public ProblemDetail handleMalformedRequest(Exception ex) {
        return problem(HttpStatus.BAD_REQUEST, "invalid-request", "Invalid request",
                "The request body or parameters could not be read: " + rootMessage(ex));
    }

    /**
     * Backstop for check-then-insert races: services check uniqueness first (and answer a specific
     * 409), but two concurrent requests can both pass the check and one then hits the DB constraint.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation() {
        return problem(HttpStatus.CONFLICT, "conflict", "Conflict",
                "The request conflicts with existing data. Retry or refresh.");
    }

    private static ProblemDetail problem(HttpStatus status, String type, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("/errors/" + type));
        problem.setTitle(title);
        return problem;
    }

    private static String rootMessage(Throwable ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        // Parser messages can be long and echo internals; keep the first line only.
        return message == null ? root.getClass().getSimpleName() : message.lines().findFirst().orElse("");
    }

    /** One entry of the {@code errors} extension member on a validation failure. */
    public record FieldViolation(String field, String message) {

        static FieldViolation of(FieldError error) {
            return new FieldViolation(error.getField(), error.getDefaultMessage());
        }
    }
}

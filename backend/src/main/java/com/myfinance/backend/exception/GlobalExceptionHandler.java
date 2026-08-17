package com.myfinance.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
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
 * <p>
 * Spring picks the handler whose exception type is closest to the thrown one, so the
 * {@link Exception} fallback at the bottom never shadows the specific handlers above it.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // MVC fills "instance" from the request path itself, so no need to set it here.
    @ExceptionHandler(ApiException.class)
    public ProblemDetail handleApiException(ApiException ex) {
        return ex.toProblemDetail();
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

    // Fixed texts: the parser/converter messages echo class names and framework internals.
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableBody() {
        return problem(HttpStatus.BAD_REQUEST, "invalid-request", "Invalid request",
                "The request body is missing or malformed.");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleParameterTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return problem(HttpStatus.BAD_REQUEST, "invalid-request", "Invalid request",
                "Query parameter '" + ex.getName() + "' has an invalid value.");
    }

    /**
     * Backstop for check-then-insert races: services check uniqueness first (and answer a specific
     * 409), but two concurrent requests can both pass the check and one then hits the DB constraint.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleConflict() {
        return problem(HttpStatus.CONFLICT, "conflict", "Conflict",
                "The request conflicts with existing data. Retry or refresh.");
    }

    /**
     * Last resort: log the real cause server-side, tell the client nothing about it.
     * <p>
     * The resolver consults advice beans in order and stops at the first one with a matching
     * handler, so this catch-all would also swallow the 405/415/404 exceptions Boot's
     * {@code ProblemDetailsExceptionHandler} normally answers. Those all implement
     * {@link ErrorResponse} and already carry their status and Problem Detail body — pass them through.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception ex) {
        if (ex instanceof ErrorResponse errorResponse) {
            return ResponseEntity.status(errorResponse.getStatusCode())
                    .headers(errorResponse.getHeaders())
                    .body(errorResponse.getBody());
        }
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError().body(
                problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal", "Internal server error",
                        "An unexpected error occurred."));
    }

    private static ProblemDetail problem(HttpStatus status, String type, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("/errors/" + type));
        problem.setTitle(title);
        return problem;
    }

    /** One entry of the {@code errors} extension member on a validation failure. */
    public record FieldViolation(String field, String message) {

        static FieldViolation of(FieldError error) {
            return new FieldViolation(error.getField(), error.getDefaultMessage());
        }
    }
}

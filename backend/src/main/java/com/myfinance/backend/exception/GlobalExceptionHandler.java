package com.myfinance.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.net.URI;
import java.util.List;

/**
 * Maps exceptions to RFC 9457 Problem Details (docs/API.md "Errors").
 * <p>
 * Extends Spring's {@link ResponseEntityExceptionHandler}, which already turns every framework
 * exception (405, 415, unknown path, unreadable body, ...) into a Problem Detail; the overrides
 * below only replace its wording where the API contract fixes a {@code type} slug or an
 * {@code errors} member. Domain failures extend {@link ApiException} and carry their own
 * status/type. Anything else is a bug and becomes a generic 500 that leaks nothing.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

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

    /**
     * Backstop for check-then-insert races: services check uniqueness first (and answer a specific
     * 409), but two concurrent requests can both pass the check and one then hits the DB constraint.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleConflict() {
        return problem(HttpStatus.CONFLICT, "conflict", "Conflict",
                "The request conflicts with existing data. Retry or refresh.");
    }

    /** Last resort: log the real cause server-side, tell the client nothing about it. */
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal", "Internal server error",
                "An unexpected error occurred.");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
                                                                  HttpHeaders headers, HttpStatusCode status,
                                                                  WebRequest request) {
        List<FieldViolation> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldViolation::of)
                .toList();
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "validation-failed", "Validation failed",
                "The request body has " + errors.size() + " invalid field(s).");
        problem.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(problem);
    }

    // Fixed texts below: the parser/converter messages echo class names and framework internals.

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
                                                                  HttpHeaders headers, HttpStatusCode status,
                                                                  WebRequest request) {
        return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "invalid-request",
                "Invalid request", "The request body is missing or malformed."));
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers,
                                                        HttpStatusCode status, WebRequest request) {
        String name = ex instanceof MethodArgumentTypeMismatchException mismatch ? mismatch.getName()
                : ex.getPropertyName();
        return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "invalid-request",
                "Invalid request", "Query parameter '" + name + "' has an invalid value."));
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

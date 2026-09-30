package com.myfinance.backend.exception;

import java.net.URI;
import java.util.List;
import java.util.Optional;

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
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

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
        return problem(
                HttpStatus.CONFLICT,
                "conflict",
                "Conflict",
                "The request conflicts with existing data. Retry or refresh.");
    }

    /** Last resort: log the real cause server-side, tell the client nothing about it. */
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return problem(
                HttpStatus.INTERNAL_SERVER_ERROR, "internal", "Internal server error", "An unexpected error occurred.");
    }

    /**
     * Bean Validation failures on a request body, listed field by field. The same exception also
     * carries a query value that Spring could not convert while binding an object such as the
     * Transaction filter (a field error flagged as a binding failure); that one answers exactly like
     * a malformed request parameter, naming the first such field. This assumes every bound object
     * in this API is bound from the query string — a form-data object would get the same
     * "Query parameter" wording.
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Optional<FieldError> bindingFailure = ex.getBindingResult().getFieldErrors().stream()
                .filter(FieldError::isBindingFailure)
                .findFirst();
        if (bindingFailure.isPresent()) {
            return invalidQueryParameter(bindingFailure.get().getField());
        }
        List<FieldViolation> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldViolation::of)
                .toList();
        ProblemDetail problem = problem(
                HttpStatus.BAD_REQUEST,
                "validation-failed",
                "Validation failed",
                "The request body has " + errors.size() + " invalid field(s).");
        problem.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(problem);
    }

    // Fixed texts below: the parser/converter messages echo class names and framework internals.

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return ResponseEntity.badRequest()
                .body(problem(
                        HttpStatus.BAD_REQUEST,
                        "invalid-request",
                        "Invalid request",
                        "The request body is missing or malformed."));
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String name =
                ex instanceof MethodArgumentTypeMismatchException mismatch ? mismatch.getName() : ex.getPropertyName();
        return invalidQueryParameter(name);
    }

    private static ResponseEntity<Object> invalidQueryParameter(String name) {
        return ResponseEntity.badRequest()
                .body(problem(
                        HttpStatus.BAD_REQUEST,
                        "invalid-request",
                        "Invalid request",
                        "Query parameter '" + name + "' has an invalid value."));
    }

    /**
     * No handler mapping matches the path at all (typo'd endpoint, wrong method prefix, ...).
     * Spring's default wording ("No static resource ...") leaks servlet-layer vocabulary and
     * carries no {@code type} slug; every other 404 in this API uses {@code /errors/not-found}
     * (see {@link com.myfinance.backend.exception.ResourceNotFoundException}), so this one does too.
     */
    @Override
    protected ResponseEntity<Object> handleNoResourceFoundException(
            NoResourceFoundException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(problem(HttpStatus.NOT_FOUND, "not-found", "Resource not found", "No resource at this path."));
    }

    /**
     * The multipart resolver throws before any controller code runs when an upload exceeds
     * {@code spring.servlet.multipart.max-file-size}; the only upload endpoint is the backup
     * restore, whose contract fixes the slug (docs/API.md "POST /api/backup/restore").
     */
    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            MaxUploadSizeExceededException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(problem(
                        HttpStatus.CONTENT_TOO_LARGE,
                        "backup-too-large",
                        "Backup file too large",
                        "The uploaded file exceeds the 20 MB limit."));
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

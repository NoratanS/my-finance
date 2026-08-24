package com.myfinance.backend.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;

/**
 * Security-filter failures happen before any controller runs, so the
 * {@code @RestControllerAdvice} never sees them. This writes the same
 * RFC 9457 shape by hand for 401 (not authenticated) and 403 (CSRF).
 */
@Component
public class ProblemDetailResponseWriter {

    private final JsonMapper jsonMapper;

    public ProblemDetailResponseWriter(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    public void write(HttpServletResponse response, HttpStatus status, String type, String title, String detail)
            throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("/errors/" + type));
        problem.setTitle(title);
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write(jsonMapper.writeValueAsString(problem));
    }
}

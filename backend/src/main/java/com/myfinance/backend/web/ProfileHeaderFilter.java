package com.myfinance.backend.web;

import java.io.IOException;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Every request that changes something must carry the {@code X-Profile-Id} header, even with an
 * empty value (docs/API.md "Active profile: one header, resolved in one place"). One that does
 * not is refused here with {@code 400 profile-header-missing}, before any controller runs.
 * <p>
 * This is what stops a page of another site from writing through the owner's browser. Such a
 * page can make the browser post a form — backup restore is a file upload, exactly what a form
 * can submit — but it cannot add a header: a cross-origin request with a custom header needs a
 * preflight first, and the backend has no CORS configuration, so no preflight is ever granted.
 * Reads pass: they change nothing, and another site's page cannot read their answers.
 * <p>
 * The filter only asks whether the header is there. What its value means is
 * {@link ActiveProfile}'s business, and the endpoints above the profile boundary never read it.
 */
@Component
public class ProfileHeaderFilter extends OncePerRequestFilter {

    private static final Set<String> READS = Set.of("GET", "HEAD", "OPTIONS");

    private final ProblemDetailResponseWriter problems;

    public ProfileHeaderFilter(ProblemDetailResponseWriter problems) {
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!READS.contains(request.getMethod()) && request.getHeader(ActiveProfile.HEADER) == null) {
            problems.write(
                    response,
                    HttpStatus.BAD_REQUEST,
                    "profile-header-missing",
                    "Profile header missing",
                    "A request that changes something must carry the X-Profile-Id header; its value may be empty.");
            return;
        }
        chain.doFilter(request, response);
    }
}

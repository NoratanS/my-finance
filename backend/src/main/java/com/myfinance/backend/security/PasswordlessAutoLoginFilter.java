package com.myfinance.backend.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.myfinance.backend.model.User;
import com.myfinance.backend.service.LocalAccountService;

/**
 * Authenticates every request as the single local account when the instance runs without passwords
 * (MYFINANCE_AUTH_MODE=none). It produces exactly the principal a real login produces, so
 * everything downstream — the active profile in the session, CSRF, and the service layer's profile
 * scoping — behaves identically and needed no change.
 *
 * <p>Registered only in that mode ({@code SecurityConfig}); in password mode this class is never in
 * the chain. An already-authenticated context is left alone, so the filter can never override a
 * real session.
 */
public class PasswordlessAutoLoginFilter extends OncePerRequestFilter {

    private final LocalAccountService localAccountService;

    public PasswordlessAutoLoginFilter(LocalAccountService localAccountService) {
        this.localAccountService = localAccountService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            User local = localAccountService.resolveLocalAccount();
            AppUserDetails principal = new AppUserDetails(local);
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(
                    UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }
}

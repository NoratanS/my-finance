package com.myfinance.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * The servlet-facing half of login: authenticates the credentials and binds the result to the
 * HTTP session, which is what the session cookie then refers to on later requests. Kept out of
 * the service layer so services stay free of servlet types ({@code AuthService.login} calls it). A
 * {@code BadCredentialsException} propagates to the {@code GlobalExceptionHandler} (401).
 * <p>
 * Spring injects request-aware proxies for {@link HttpServletRequest} and
 * {@link HttpServletResponse} (as for {@link ActiveProfile}), so this singleton always works on the
 * current request. <strong>Call it only on a request thread</strong> — from a job or another
 * thread the proxies fail with "no thread-bound request".
 */
@Component
public class SessionAuthenticator {

    private final HttpServletRequest request;
    private final HttpServletResponse response;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final ActiveProfile activeProfile;

    public SessionAuthenticator(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository,
            ActiveProfile activeProfile) {
        this.request = request;
        this.response = response;
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
        this.activeProfile = activeProfile;
    }

    /** Logs in with the email as typed; the account lookup normalizes it ({@link AppUserDetailsService}). */
    public AppUserDetails login(String email, String password) {
        Authentication authentication =
                authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(email, password));

        // Session fixation: never keep the id of a session that existed before login.
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        // A fresh login never inherits a profile chosen by an earlier session.
        activeProfile.clear();

        return (AppUserDetails) authentication.getPrincipal();
    }
}

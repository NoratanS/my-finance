package com.myfinance.backend.security;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.stereotype.Component;

import com.myfinance.backend.exception.NoActiveProfileException;

/**
 * The profile the current session is scoped to, stored as an HTTP session attribute. It lives
 * server-side (docs/API.md "Active profile: server-side, never client-supplied"); the only writer
 * is the profile-switch endpoint, after verifying ownership.
 * <p>
 * Spring injects a request-aware proxy for {@link HttpServletRequest}, so this singleton is safe to
 * use from any request thread. Only {@link #set} creates a session: reading or clearing never
 * does, so a cookieless request on a passwordless instance (e.g. the docker-compose healthcheck
 * probing {@code /api/auth/me}) leaves nothing behind in the session store.
 */
@Component
public class ActiveProfile {

    public static final String SESSION_KEY = "ACTIVE_PROFILE_ID";

    private final HttpServletRequest request;

    public ActiveProfile(HttpServletRequest request) {
        this.request = request;
    }

    public Optional<Long> id() {
        HttpSession session = request.getSession(false);
        return session == null ? Optional.empty() : Optional.ofNullable((Long) session.getAttribute(SESSION_KEY));
    }

    /** The active profile id, or a 409 {@code no-active-profile} if none is selected. */
    public Long requireId() {
        return id().orElseThrow(NoActiveProfileException::new);
    }

    public void set(Long profileId) {
        request.getSession().setAttribute(SESSION_KEY, profileId);
    }

    public void clear() {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.removeAttribute(SESSION_KEY);
        }
    }
}

package com.myfinance.backend.security;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.stereotype.Component;

import com.myfinance.backend.exception.NoActiveProfileException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.ProfileRepository;

/**
 * The active profile of the current request, proven to exist and to belong to the authenticated
 * user each time it is resolved (docs/API.md "Active profile: server-side, never client-supplied").
 * The session store holds only the profile's id; the id was checked when it was stored, and it is
 * checked again — one owner-scoped primary-key lookup — every time a request uses it, because the
 * profile can be deleted afterwards from another session.
 * <p>
 * Invariants:
 * <ul>
 *   <li>A stored id that no longer names one of the user's profiles is a dangling active profile:
 *       it is removed from the session and the request is answered as if nothing were selected —
 *       {@code 409 no-active-profile}, never {@code 404} (the request did not name the profile).
 *   <li>Resolving never creates a session: with no session or nothing stored, it answers "none"
 *       without a query, so a cookieless request on a passwordless instance (e.g. the
 *       docker-compose healthcheck probing {@code /api/auth/me}) leaves nothing behind in the
 *       session store.
 *   <li>Resolve once per operation and pass the id or the {@link Profile} down: a second
 *       resolution is correct but costs a second lookup.
 * </ul>
 * Spring injects a request-aware proxy for {@link HttpServletRequest}, so this singleton is safe to
 * use from any request thread.
 */
@Component
public class ActiveProfile {

    public static final String SESSION_KEY = "ACTIVE_PROFILE_ID";

    private final HttpServletRequest request;
    private final CurrentUser currentUser;
    private final ProfileRepository profileRepository;

    public ActiveProfile(HttpServletRequest request, CurrentUser currentUser, ProfileRepository profileRepository) {
        this.request = request;
        this.currentUser = currentUser;
        this.profileRepository = profileRepository;
    }

    /**
     * The active profile, if one is selected and still resolves; a dangling one is cleared and
     * reads as none. For describing the session ({@code GET /api/auth/me}), where "none" is an
     * answer rather than an error.
     */
    public Optional<Profile> find() {
        return storedId().flatMap(id -> clearIfDangling(profileRepository.findByIdAndUserId(id, currentUser.id())));
    }

    /** The active profile's id, or a 409 {@code no-active-profile} if none is selected or it no longer resolves. */
    public Long requireId() {
        return find().map(Profile::getId).orElseThrow(NoActiveProfileException::new);
    }

    /** The stored id, unverified. Prefer {@link #find} or {@link #requireId}. */
    public Optional<Long> id() {
        return storedId();
    }

    public void set(Long profileId) {
        request.getSession().setAttribute(SESSION_KEY, profileId);
    }

    /** Forgets the selection. Never creates a session. */
    public void clear() {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.removeAttribute(SESSION_KEY);
        }
    }

    private Optional<Long> storedId() {
        HttpSession session = request.getSession(false);
        return session == null ? Optional.empty() : Optional.ofNullable((Long) session.getAttribute(SESSION_KEY));
    }

    private Optional<Profile> clearIfDangling(Optional<Profile> profile) {
        if (profile.isEmpty()) {
            clear();
        }
        return profile;
    }
}

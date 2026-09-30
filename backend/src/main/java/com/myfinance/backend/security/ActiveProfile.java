package com.myfinance.backend.security;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.stereotype.Component;

import com.myfinance.backend.exception.NoActiveProfileException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.ProfileRepository;

/**
 * The active profile of the current request, proven to exist and to belong to the authenticated
 * user each time it is resolved (docs/API.md "Active profile: server-side, never client-supplied").
 * The session store holds only the profile's id; the id was checked when it was stored (by
 * {@link #switchTo}, the only writer), and it is checked again — one owner-scoped primary-key
 * lookup — every time a request uses it, because the profile can be deleted afterwards from
 * another session.
 * <p>
 * Invariants:
 * <ul>
 *   <li>A stored id that no longer names one of the user's profiles is a dangling active profile:
 *       it is removed from the session and the request is answered as if nothing were selected —
 *       {@code 409 no-active-profile}, never {@code 404} (the request did not name the profile).
 *   <li>Only {@link #switchTo} creates a session. Resolving and clearing never do: with no
 *       session or nothing stored, resolving answers "none" without a query, so a cookieless
 *       request on a passwordless instance (e.g. the docker-compose healthcheck probing
 *       {@code /api/auth/me}) leaves nothing behind in the session store.
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
        return resolve(false);
    }

    /**
     * The active profile, or a 409 {@code no-active-profile} if none is selected or it no longer
     * resolves. Managed within the caller's transaction, so it can be the owner of a new row.
     */
    public Profile require() {
        return find().orElseThrow(NoActiveProfileException::new);
    }

    /**
     * {@link #require}, resolved with a row lock on the profile ({@code SELECT ... FOR UPDATE})
     * that is held until the caller's transaction ends: changes to one profile's category tree
     * run one at a time, and a concurrent delete of the profile either completes first (then this
     * answers 409) or waits for the caller to finish. <strong>Call it only inside a read-write
     * transaction</strong> — the lock is worth nothing once the transaction that took it ends.
     */
    public Profile requireLocked() {
        return resolve(true).orElseThrow(NoActiveProfileException::new);
    }

    /** The active profile's id, or a 409 {@code no-active-profile} if none is selected or it no longer resolves. */
    public Long requireId() {
        return require().getId();
    }

    /**
     * The hinge of the scoping model: the only place a client-supplied profile id is accepted,
     * and it is only stored once it is proven to belong to the current user. A profile owned by
     * someone else is indistinguishable from a missing one (404 — unlike a stored id, which
     * answers 409). The only operation that may create a session.
     */
    public Profile switchTo(Long profileId) {
        Profile profile = profileRepository
                .findByIdAndUserId(profileId, currentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("profile", profileId));
        request.getSession().setAttribute(SESSION_KEY, profile.getId());
        return profile;
    }

    /** Forgets the selection. Never creates a session. */
    public void clear() {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.removeAttribute(SESSION_KEY);
        }
    }

    /**
     * Nothing stored: empty, without a query. Otherwise one owner-scoped lookup (row-locked if
     * {@code locked}); a stored id that finds nothing is dangling and is forgotten.
     */
    private Optional<Profile> resolve(boolean locked) {
        HttpSession session = request.getSession(false);
        Long storedId = session == null ? null : (Long) session.getAttribute(SESSION_KEY);
        if (storedId == null) {
            return Optional.empty();
        }
        Long userId = currentUser.id();
        Optional<Profile> profile = locked
                ? profileRepository.lockByIdAndUserId(storedId, userId)
                : profileRepository.findByIdAndUserId(storedId, userId);
        if (profile.isEmpty()) {
            session.removeAttribute(SESSION_KEY);
        }
        return profile;
    }
}

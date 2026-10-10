package com.myfinance.backend.web;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.stereotype.Component;

import com.myfinance.backend.exception.NoActiveProfileException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.ProfileRepository;

/**
 * The active profile of the current request (docs/API.md "Active profile: one header, resolved in
 * one place"). The browser remembers which profile is chosen and names it in the
 * {@code X-Profile-Id} header of every request; this is the only place that header's value is
 * read, and it is proven to name an existing profile — one primary-key lookup — each time it is
 * used.
 * <p>
 * Invariants:
 * <ul>
 *   <li>A header that is missing, empty, not a number, or that names no existing profile all mean
 *       the same thing, no active profile: {@code 409 no-active-profile}, never {@code 404} (the
 *       request did not name the profile as a resource). A profile that was just deleted needs no
 *       bookkeeping for the same reason: the next request naming it finds nothing.
 *   <li>The profile is never a path segment, a query parameter or a body field of a
 *       profile-scoped request, so every query can be scoped by the one id handed out here.
 *   <li>Resolve once per operation and pass the id or the {@link Profile} down: a second
 *       resolution is correct but costs a second lookup.
 * </ul>
 * Spring injects a request-aware proxy for {@link HttpServletRequest}, so this singleton is safe to
 * use from any request thread.
 */
@Component
public class ActiveProfile {

    public static final String HEADER = "X-Profile-Id";

    private final HttpServletRequest request;
    private final ProfileRepository profileRepository;

    public ActiveProfile(HttpServletRequest request, ProfileRepository profileRepository) {
        this.request = request;
        this.profileRepository = profileRepository;
    }

    /**
     * The active profile, or a 409 {@code no-active-profile} if the request names none. Managed
     * within the caller's transaction, so it can be the owner of a new row.
     */
    public Profile require() {
        return resolve(false).orElseThrow(NoActiveProfileException::new);
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

    /** The active profile's id, or a 409 {@code no-active-profile} if the request names none. */
    public Long requireId() {
        return require().getId();
    }

    /** No usable id in the header: empty, without a query. Otherwise one lookup by primary key. */
    private Optional<Profile> resolve(boolean locked) {
        Long id = headerValue();
        if (id == null) {
            return Optional.empty();
        }
        return locked ? profileRepository.lockById(id) : profileRepository.findById(id);
    }

    private Long headerValue() {
        String value = request.getHeader(HEADER);
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}

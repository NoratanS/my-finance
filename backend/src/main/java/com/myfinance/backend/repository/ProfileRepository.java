package com.myfinance.backend.repository;

import com.myfinance.backend.model.Profile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Profiles sit above the profile boundary, so they are scoped by <em>user</em>:
 * every method takes the authenticated user's id.
 */
public interface ProfileRepository extends JpaRepository<Profile, Long> {

    List<Profile> findAllByUserIdOrderByCreatedAtAsc(Long userId);

    /** Returns empty for a profile that exists but belongs to another user — callers turn that into 404. */
    Optional<Profile> findByIdAndUserId(Long id, Long userId);

    boolean existsByUserIdAndName(Long userId, String name);
}

package com.myfinance.backend.repository;

import com.myfinance.backend.model.Profile;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    long countByUserId(Long userId);

    /**
     * {@code SELECT ... FOR UPDATE} on the profile row: held until the transaction ends, so
     * concurrent mutations of one profile's category tree are serialised (see {@code CategoryService}).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Profile p where p.id = :id")
    Optional<Profile> lockById(@Param("id") Long id);
}

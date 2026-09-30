package com.myfinance.backend.repository;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.myfinance.backend.model.Profile;

/**
 * Profiles sit above the profile boundary, so they are scoped by <em>user</em>:
 * every method takes the authenticated user's id.
 */
public interface ProfileRepository extends JpaRepository<Profile, Long> {

    List<Profile> findAllByUserIdOrderByCreatedAtAsc(Long userId);

    /** Returns empty for a profile that exists but belongs to another user — callers turn that into 404. */
    Optional<Profile> findByIdAndUserId(Long id, Long userId);

    boolean existsByUserIdAndName(Long userId, String name);

    /**
     * {@link #findByIdAndUserId} as {@code SELECT ... FOR UPDATE} on the profile row: held until
     * the transaction ends, so concurrent mutations of one profile's category tree are serialised
     * (see {@code ActiveProfile#requireLocked}).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Profile p where p.id = :id and p.user.id = :userId")
    Optional<Profile> lockByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);

    /**
     * {@code SELECT ... FOR UPDATE} on every profile the user owns: held until the transaction
     * ends, so two concurrent deletes for the same user — even of two different profiles —
     * can't both observe "more than one left" and race the count to zero. The loser blocks on
     * the winner's commit, then re-reads the now-current (smaller) row set (see
     * {@code ProfileService#delete}).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Profile p where p.user.id = :userId")
    List<Profile> lockAllByUserId(@Param("userId") Long userId);
}

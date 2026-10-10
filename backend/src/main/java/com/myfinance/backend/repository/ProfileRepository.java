package com.myfinance.backend.repository;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.myfinance.backend.model.Profile;

/** Profiles sit above the profile boundary: nothing scopes them, and a profile is looked up by id alone. */
public interface ProfileRepository extends JpaRepository<Profile, Long> {

    List<Profile> findAllByOrderByCreatedAtAsc();

    boolean existsByName(String name);

    /**
     * {@link #findById} as {@code SELECT ... FOR UPDATE} on the profile row: held until the
     * transaction ends, so concurrent mutations of one profile's category tree are serialised
     * (see {@code ActiveProfile#requireLocked}).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Profile p where p.id = :id")
    Optional<Profile> lockById(@Param("id") Long id);
}

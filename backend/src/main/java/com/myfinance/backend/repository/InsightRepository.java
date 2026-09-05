package com.myfinance.backend.repository;

import com.myfinance.backend.model.Insight;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InsightRepository extends JpaRepository<Insight, Long> {

    /** The listing docs/API.md "GET /api/insights" specifies: pinned first, then alphabetical. */
    List<Insight> findByProfileIdOrderByPinnedDescNameAsc(Long profileId);

    /** Single-row access is always scoped: another profile's row is simply not found (404). */
    Optional<Insight> findByIdAndProfileId(Long id, Long profileId);

    boolean existsByProfileIdAndName(Long profileId, String name);

    /** Rename collision check: an insight keeping its own name is not a collision. */
    boolean existsByProfileIdAndNameAndIdNot(Long profileId, String name, Long id);
}

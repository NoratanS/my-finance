package com.myfinance.backend.repository;

import com.myfinance.backend.model.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Every query is scoped by {@code profileId}: an id from another profile simply finds nothing,
 * which the service layer reports as 404 (docs/API.md "Not found, and wrong-profile access").
 * <p>
 * The recursive CTEs are native SQL because JPQL has no {@code WITH RECURSIVE} — see
 * docs/SCHEMA.md "Hierarchy queries".
 */
public interface CategoryRepository extends JpaRepository<Category, Long> {

    List<Category> findAllByProfileIdOrderByNameAsc(Long profileId);

    Optional<Category> findByIdAndProfileId(Long id, Long profileId);

    /**
     * Explicit JPQL: {@link Category#getParentId()} makes Spring Data see {@code parentId} as a plain
     * property (which Hibernate has no mapping for) instead of traversing {@code parent.id}.
     */
    @Query("SELECT COUNT(c) > 0 FROM Category c WHERE c.profile.id = :profileId AND c.parent.id = :parentId AND c.name = :name")
    boolean existsByProfileIdAndParentIdAndName(@Param("profileId") Long profileId, @Param("parentId") Long parentId,
                                                @Param("name") String name);

    boolean existsByProfileIdAndParentIsNullAndName(Long profileId, String name);

    @Query("SELECT COUNT(c) FROM Category c WHERE c.parent.id = :parentId")
    long countByParentId(@Param("parentId") Long parentId);

    /**
     * Ids of the given category and all its descendants (docs/SCHEMA.md query 3, without the depth).
     * Used to expand a subtree before filtering transactions, and to detect cycles on reparent.
     */
    @Query(value = """
            WITH RECURSIVE subtree AS (
                SELECT id FROM category WHERE id = :categoryId AND profile_id = :profileId
                UNION ALL
                SELECT c.id FROM category c JOIN subtree s ON c.parent_id = s.id
                 WHERE c.profile_id = :profileId
            )
            SELECT id FROM subtree
            """, nativeQuery = true)
    List<Long> findSubtreeIds(@Param("categoryId") Long categoryId, @Param("profileId") Long profileId);

    /** Depth of a category (docs/SCHEMA.md query 2). A root is 1. Empty if not found in the profile. */
    @Query(value = """
            WITH RECURSIVE ancestors AS (
                SELECT id, parent_id, 1 AS depth FROM category
                 WHERE id = :categoryId AND profile_id = :profileId
                UNION ALL
                SELECT c.id, c.parent_id, a.depth + 1 FROM category c
                  JOIN ancestors a ON c.id = a.parent_id
                 WHERE c.profile_id = :profileId
            )
            SELECT MAX(depth) FROM ancestors
            """, nativeQuery = true)
    Optional<Integer> findDepth(@Param("categoryId") Long categoryId, @Param("profileId") Long profileId);

    /** Height of the subtree rooted at a category (docs/SCHEMA.md query 3). A leaf is 1. */
    @Query(value = """
            WITH RECURSIVE subtree AS (
                SELECT id, 1 AS depth FROM category
                 WHERE id = :categoryId AND profile_id = :profileId
                UNION ALL
                SELECT c.id, s.depth + 1 FROM category c
                  JOIN subtree s ON c.parent_id = s.id
                 WHERE c.profile_id = :profileId
            )
            SELECT MAX(depth) FROM subtree
            """, nativeQuery = true)
    Optional<Integer> findSubtreeHeight(@Param("categoryId") Long categoryId, @Param("profileId") Long profileId);
}

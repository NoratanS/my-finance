package com.myfinance.backend.repository;

import com.myfinance.backend.model.Budget;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.LocalDate;
import java.util.Optional;

public interface BudgetRepository extends JpaRepository<Budget, Long>, JpaSpecificationExecutor<Budget> {

    Optional<Budget> findByIdAndProfileId(Long id, Long profileId);

    long countByCategoryId(Long categoryId);

    boolean existsByProfileIdAndCategoryIdAndPeriodStartAndPeriodEnd(Long profileId, Long categoryId,
                                                                    LocalDate periodStart, LocalDate periodEnd);
}

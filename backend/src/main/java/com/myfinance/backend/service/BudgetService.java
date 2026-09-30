package com.myfinance.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.dto.BudgetRequest;
import com.myfinance.backend.dto.BudgetResponse;
import com.myfinance.backend.dto.BudgetStatusResponse;
import com.myfinance.backend.dto.BudgetSummary;
import com.myfinance.backend.exception.BudgetExistsException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Money;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.BudgetSpecifications;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.CurrencyTotal;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.security.ActiveProfile;

@Service
@Transactional(readOnly = true)
public class BudgetService {

    private static final Sort LIST_ORDER = Sort.by(Sort.Order.desc("periodStart"), Sort.Order.desc("id"));

    private final BudgetRepository budgetRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final ActiveProfile activeProfile;

    public BudgetService(
            BudgetRepository budgetRepository,
            CategoryRepository categoryRepository,
            TransactionRepository transactionRepository,
            ActiveProfile activeProfile) {
        this.budgetRepository = budgetRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.activeProfile = activeProfile;
    }

    @Transactional
    public BudgetResponse create(BudgetRequest request) {
        Profile profile = activeProfile.require();
        Category category = requireCategory(request.categoryId(), profile.getId());
        // Check-then-insert; the UNIQUE (profile_id, category_id, period_start, period_end) is the backstop.
        if (budgetRepository.existsByProfileIdAndCategoryIdAndPeriodStartAndPeriodEnd(
                profile.getId(), category.getId(), request.periodStart(), request.periodEnd())) {
            throw new BudgetExistsException();
        }
        Budget budget = budgetRepository.save(new Budget(
                profile,
                category,
                request.amountLimit(),
                request.currency(),
                request.periodStart(),
                request.periodEnd()));
        return BudgetResponse.from(budget);
    }

    public BudgetResponse get(Long id) {
        return BudgetResponse.from(requireBudget(id, activeProfile.requireId()));
    }

    public List<BudgetResponse> list(LocalDate activeOn, Long categoryId) {
        Long profileId = activeProfile.requireId();
        Specification<Budget> spec =
                BudgetSpecifications.inProfile(profileId).and(BudgetSpecifications.fetchCategory());
        if (activeOn != null) {
            spec = spec.and(BudgetSpecifications.activeOn(activeOn));
        }
        if (categoryId != null) {
            requireCategory(categoryId, profileId);
            spec = spec.and(BudgetSpecifications.forCategory(categoryId));
        }
        return budgetRepository.findAll(spec, LIST_ORDER).stream()
                .map(BudgetResponse::from)
                .toList();
    }

    @Transactional
    public BudgetResponse update(Long id, BudgetRequest request) {
        Long profileId = activeProfile.requireId();
        Budget budget = requireBudget(id, profileId);
        Category category = requireCategory(request.categoryId(), profileId);
        // Moving a budget back onto its own current slot is an edit, not a collision.
        boolean sameSlot = budget.getCategory().getId().equals(category.getId())
                && budget.getPeriodStart().equals(request.periodStart())
                && budget.getPeriodEnd().equals(request.periodEnd());
        if (!sameSlot
                && budgetRepository.existsByProfileIdAndCategoryIdAndPeriodStartAndPeriodEnd(
                        profileId, category.getId(), request.periodStart(), request.periodEnd())) {
            throw new BudgetExistsException();
        }
        budget.update(category, request.amountLimit(), request.currency(), request.periodStart(), request.periodEnd());
        // Managed entity: the change is flushed on commit, no explicit save() needed.
        return BudgetResponse.from(budget);
    }

    @Transactional
    public void delete(Long id) {
        Budget budget = requireBudget(id, activeProfile.requireId());
        budgetRepository.delete(budget);
    }

    public BudgetStatusResponse status(Long id) {
        Long profileId = activeProfile.requireId();
        Budget budget = requireBudget(id, profileId);

        List<CurrencyTotal> totals = transactionRepository.sumExpensesBySubtreeAndPeriod(
                profileId, budget.getCategory().getId(), budget.getPeriodStart(), budget.getPeriodEnd());

        BigDecimal spent = totals.stream()
                .filter(t -> t.getCurrency().equals(budget.getCurrency()))
                .map(CurrencyTotal::getTotal)
                .findFirst()
                .orElse(BigDecimal.ZERO);
        spent = Money.normalize(spent);
        List<String> excludedCurrencies = totals.stream()
                .map(CurrencyTotal::getCurrency)
                .filter(c -> !c.equals(budget.getCurrency()))
                .sorted()
                .toList();

        BigDecimal limit = budget.getAmountLimit();
        BigDecimal remaining = limit.subtract(spent);
        double percentUsed = spent.multiply(BigDecimal.valueOf(100))
                .divide(limit, 2, RoundingMode.HALF_UP)
                .doubleValue();

        return new BudgetStatusResponse(
                BudgetSummary.from(budget),
                spent,
                remaining,
                percentUsed,
                spent.compareTo(limit) > 0,
                true,
                excludedCurrencies);
    }

    private Budget requireBudget(Long id, Long profileId) {
        return budgetRepository
                .findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("budget", id));
    }

    private Category requireCategory(Long id, Long profileId) {
        return categoryRepository
                .findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("category", id));
    }
}

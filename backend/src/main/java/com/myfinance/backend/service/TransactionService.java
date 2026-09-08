package com.myfinance.backend.service;

import com.myfinance.backend.dto.CategoryTotal;
import com.myfinance.backend.dto.CategoryTransactionCount;
import com.myfinance.backend.dto.MerchantBackfillRequest;
import com.myfinance.backend.dto.MerchantBackfillResponse;
import com.myfinance.backend.dto.MerchantSuggestion;
import com.myfinance.backend.dto.PageResponse;
import com.myfinance.backend.dto.TransactionRequest;
import com.myfinance.backend.dto.TransactionResponse;
import com.myfinance.backend.dto.TransactionSummary;
import com.myfinance.backend.exception.InvalidRequestException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Money;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.TransactionAggregates.CurrencyTypeTotal;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.repository.TransactionSpecifications;
import com.myfinance.backend.security.ActiveProfile;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Transactions of the active profile (docs/API.md "Transactions"). Every repository call is
 * scoped by the session's profile id, so another profile's rows are simply not found.
 */
@Service
@Transactional(readOnly = true)
public class TransactionService {

    public static final int MAX_PAGE_SIZE = 200;
    public static final int MAX_SEARCH_LENGTH = 100;

    private static final Sort LIST_ORDER = Sort.by(Sort.Order.desc("occurredOn"), Sort.Order.desc("id"));

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final ProfileRepository profileRepository;
    private final ActiveProfile activeProfile;

    public TransactionService(TransactionRepository transactionRepository, CategoryRepository categoryRepository,
                              ProfileRepository profileRepository, ActiveProfile activeProfile) {
        this.transactionRepository = transactionRepository;
        this.categoryRepository = categoryRepository;
        this.profileRepository = profileRepository;
        this.activeProfile = activeProfile;
    }

    @Transactional
    public TransactionResponse create(TransactionRequest request) {
        Long profileId = activeProfile.requireId();
        Category category = requireCategory(request.categoryId(), profileId);
        // getReferenceById returns a lazy proxy: no SELECT, just the FK value for the INSERT.
        Profile profile = profileRepository.getReferenceById(profileId);
        Transaction transaction = new Transaction(profile, category, request.amount(), request.currency(),
                request.type(), request.occurredOn(), request.description(), request.merchant());
        return TransactionResponse.from(transactionRepository.save(transaction));
    }

    public TransactionResponse get(Long id) {
        return TransactionResponse.from(requireTransaction(id, activeProfile.requireId()));
    }

    public PageResponse<TransactionResponse> list(TransactionFilter filter) {
        Long profileId = activeProfile.requireId();
        validate(filter);

        Specification<Transaction> spec = filterSpec(filter, profileId)
                .and(TransactionSpecifications.fetchCategory());
        PageRequest pageRequest = PageRequest.of(filter.page(), filter.size(), LIST_ORDER);
        return PageResponse.from(transactionRepository.findAll(spec, pageRequest), TransactionResponse::from);
    }

    /**
     * Income, expense and net over <em>every</em> matching transaction, one row per currency
     * (docs/API.md "GET /api/transactions/summary"). Grouped in SQL: summing a page client-side
     * silently under-reports as soon as the match is larger than one page.
     */
    public List<TransactionSummary> summary(TransactionFilter filter) {
        Long profileId = activeProfile.requireId();
        validate(filter);

        Map<String, List<CurrencyTypeTotal>> byCurrency = transactionRepository
                .sumByCurrencyAndType(filterSpec(filter, profileId)).stream()
                .collect(Collectors.groupingBy(CurrencyTypeTotal::currency, LinkedHashMap::new, Collectors.toList()));
        return byCurrency.entrySet().stream()
                .map(entry -> TransactionSummary.of(entry.getKey(),
                        totalOf(entry.getValue(), TransactionType.INCOME),
                        totalOf(entry.getValue(), TransactionType.EXPENSE),
                        entry.getValue().stream().mapToLong(CurrencyTypeTotal::count).sum()))
                .toList();
    }

    /**
     * Transactions per category for the whole profile, counted as filed (docs/API.md
     * "GET /api/transactions/category-counts"). No subtree roll-up — the client holds the tree and
     * rolls up whichever way its screen needs. {@code q} is the only filter it accepts: every field
     * of {@code filter} besides that and paging is fixed by the controller for this endpoint.
     */
    public List<CategoryTransactionCount> categoryCounts(TransactionFilter filter) {
        Long profileId = activeProfile.requireId();
        validate(filter);

        return transactionRepository.countByCategory(filterSpec(filter, profileId)).stream()
                .map(row -> new CategoryTransactionCount(row.categoryId(), row.count()))
                .toList();
    }

    /**
     * Summed amounts per category and currency over every matching transaction (docs/API.md
     * "GET /api/transactions/category-totals") — the dashboard's spend-by-category chart.
     */
    public List<CategoryTotal> categoryTotals(TransactionFilter filter) {
        Long profileId = activeProfile.requireId();
        validate(filter);

        return transactionRepository.sumByCategoryAndCurrency(filterSpec(filter, profileId)).stream()
                .map(row -> new CategoryTotal(row.categoryId(), row.currency(), Money.normalize(row.total())))
                .toList();
    }

    /**
     * The optional filters of {@code GET /api/transactions}, always under the active profile.
     * The list and the three aggregates share it, so a total always covers exactly the rows its
     * list would show. The category lookup is part of it on purpose: a {@code categoryId} from
     * another profile is a 404 for every one of them.
     */
    private Specification<Transaction> filterSpec(TransactionFilter filter, Long profileId) {
        Specification<Transaction> spec = TransactionSpecifications.inProfile(profileId);
        if (filter.from() != null) {
            spec = spec.and(TransactionSpecifications.occurredOnOrAfter(filter.from()));
        }
        if (filter.to() != null) {
            spec = spec.and(TransactionSpecifications.occurredOnOrBefore(filter.to()));
        }
        if (filter.type() != null) {
            spec = spec.and(TransactionSpecifications.ofType(filter.type()));
        }
        if (filter.categoryId() != null) {
            Category category = requireCategory(filter.categoryId(), profileId);
            List<Long> categoryIds = filter.includeDescendants()
                    ? categoryRepository.findSubtreeIds(category.getId(), profileId)
                    : List.of(category.getId());
            spec = spec.and(TransactionSpecifications.inCategories(categoryIds));
        }
        if (filter.q() != null && !filter.q().isBlank()) {
            spec = spec.and(TransactionSpecifications.matchesSearch(filter.q()));
        }
        return spec;
    }

    /** The one grouped row of that type, or zero when the match holds none of it. */
    private static BigDecimal totalOf(List<CurrencyTypeTotal> rows, TransactionType type) {
        return rows.stream()
                .filter(row -> row.type() == type)
                .map(CurrencyTypeTotal::total)
                .findFirst()
                .orElse(BigDecimal.ZERO);
    }

    /**
     * Descriptions worth turning into merchants. Deliberately dumb: exact grouping on the
     * description, groups of two or more, twenty at most — see docs/API.md for what it does not do.
     */
    public List<MerchantSuggestion> merchantSuggestions() {
        Long profileId = activeProfile.requireId();
        return transactionRepository.findMerchantSuggestions(profileId).stream()
                .map(row -> new MerchantSuggestion(row.getDescription(), row.getTransactionCount()))
                .toList();
    }

    @Transactional
    public MerchantBackfillResponse backfillMerchant(MerchantBackfillRequest request) {
        Long profileId = activeProfile.requireId();
        List<Transaction> matches = transactionRepository
                .findAllByProfileIdAndMerchantIsNullAndDescription(profileId, request.description());
        for (Transaction transaction : matches) {
            transaction.assignMerchant(request.merchant());
        }
        // Managed entities: the changes are flushed on commit, no explicit save() needed.
        return new MerchantBackfillResponse(matches.size());
    }

    @Transactional
    public TransactionResponse update(Long id, TransactionRequest request) {
        Long profileId = activeProfile.requireId();
        Transaction transaction = requireTransaction(id, profileId);
        Category category = requireCategory(request.categoryId(), profileId);
        transaction.update(category, request.amount(), request.currency(), request.type(),
                request.occurredOn(), request.description(), request.merchant());
        // Managed entity: the change is flushed on commit, no explicit save() needed.
        return TransactionResponse.from(transaction);
    }

    @Transactional
    public void delete(Long id) {
        Transaction transaction = requireTransaction(id, activeProfile.requireId());
        transactionRepository.delete(transaction);
    }

    private static void validate(TransactionFilter filter) {
        if (filter.from() != null && filter.to() != null && filter.from().isAfter(filter.to())) {
            throw new InvalidRequestException("'from' must not be after 'to'.");
        }
        if (filter.includeDescendants() && filter.categoryId() == null) {
            throw new InvalidRequestException("'includeDescendants' requires 'categoryId'.");
        }
        if (filter.page() < 0) {
            throw new InvalidRequestException("'page' must be 0 or greater.");
        }
        if (filter.size() < 1 || filter.size() > MAX_PAGE_SIZE) {
            throw new InvalidRequestException("'size' must be between 1 and " + MAX_PAGE_SIZE + ".");
        }
        if (filter.q() != null && filter.q().length() > MAX_SEARCH_LENGTH) {
            throw new InvalidRequestException("'q' must be at most " + MAX_SEARCH_LENGTH + " characters.");
        }
    }

    private Transaction requireTransaction(Long id, Long profileId) {
        return transactionRepository.findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("transaction", id));
    }

    private Category requireCategory(Long id, Long profileId) {
        return categoryRepository.findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("category", id));
    }
}

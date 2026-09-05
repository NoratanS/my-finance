package com.myfinance.backend.service;

import com.myfinance.backend.dto.MerchantBackfillRequest;
import com.myfinance.backend.dto.MerchantBackfillResponse;
import com.myfinance.backend.dto.MerchantSuggestion;
import com.myfinance.backend.dto.PageResponse;
import com.myfinance.backend.dto.TransactionRequest;
import com.myfinance.backend.dto.TransactionResponse;
import com.myfinance.backend.exception.InvalidRequestException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.repository.TransactionSpecifications;
import com.myfinance.backend.security.ActiveProfile;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Transactions of the active profile (docs/API.md "Transactions"). Every repository call is
 * scoped by the session's profile id, so another profile's rows are simply not found.
 */
@Service
@Transactional(readOnly = true)
public class TransactionService {

    public static final int MAX_PAGE_SIZE = 200;

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

        Specification<Transaction> spec = TransactionSpecifications.inProfile(profileId)
                .and(TransactionSpecifications.fetchCategory());
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

        PageRequest pageRequest = PageRequest.of(filter.page(), filter.size(), LIST_ORDER);
        return PageResponse.from(transactionRepository.findAll(spec, pageRequest), TransactionResponse::from);
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

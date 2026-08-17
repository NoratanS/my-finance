package com.myfinance.backend.service;

import com.myfinance.backend.dto.CategoryNode;
import com.myfinance.backend.dto.CreateCategoryRequest;
import com.myfinance.backend.dto.UpdateCategoryRequest;
import com.myfinance.backend.exception.CategoryCycleException;
import com.myfinance.backend.exception.CategoryDepthExceededException;
import com.myfinance.backend.exception.CategoryInUseException;
import com.myfinance.backend.exception.CategoryNameTakenException;
import com.myfinance.backend.exception.InvalidRequestException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.security.ActiveProfile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

/**
 * Category tree rules (docs/SCHEMA.md "Depth enforcement", docs/API.md "Categories").
 * Every query is scoped to the session's active profile, so foreign ids come back as 404.
 */
@Service
@Transactional
public class CategoryService {

    static final int MAX_DEPTH = 5;
    private static final int MAX_NAME_LENGTH = 100;

    private final CategoryRepository categoryRepository;
    private final ProfileRepository profileRepository;
    private final TransactionRepository transactionRepository;
    private final BudgetRepository budgetRepository;
    private final ActiveProfile activeProfile;

    public CategoryService(CategoryRepository categoryRepository, ProfileRepository profileRepository,
                           TransactionRepository transactionRepository, BudgetRepository budgetRepository,
                           ActiveProfile activeProfile) {
        this.categoryRepository = categoryRepository;
        this.profileRepository = profileRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
        this.activeProfile = activeProfile;
    }

    @Transactional(readOnly = true)
    public List<CategoryNode> tree() {
        Long profileId = activeProfile.requireId();
        return CategoryTreeBuilder.forest(categoryRepository.findAllByProfileIdOrderByNameAsc(profileId));
    }

    public CategoryNode create(CreateCategoryRequest request) {
        Long profileId = activeProfile.requireId();
        Category parent = null;
        int depth = 1;
        if (request.parentId() != null) {
            parent = findInProfile(request.parentId(), profileId);
            depth = depthOf(parent, profileId) + 1;
            if (depth > MAX_DEPTH) {
                throw new CategoryDepthExceededException(MAX_DEPTH, depth,
                        "Creating '" + request.name() + "' under '" + parent.getName() + "' would place it at level "
                                + depth + ". The maximum is " + MAX_DEPTH + ".");
            }
        }
        requireNameFree(profileId, parent, request.name());

        Profile profile = profileRepository.getReferenceById(profileId);
        Category saved = categoryRepository.save(new Category(profile, parent, request.name()));
        return new CategoryNode(saved.getId(), saved.getName(), saved.getParentId(), depth, List.of());
    }

    public CategoryNode update(Long id, UpdateCategoryRequest request) {
        Long profileId = activeProfile.requireId();
        if (!request.isNameSet() && !request.isParentIdSet()) {
            throw new InvalidRequestException("At least one of 'name' or 'parentId' must be supplied.");
        }
        if (request.isNameSet()) {
            validateName(request.getName());
        }
        Category category = findInProfile(id, profileId);

        String newName = request.isNameSet() ? request.getName() : category.getName();
        Category newParent = category.getParent();
        if (request.isParentIdSet()) {
            newParent = request.getParentId() == null ? null : findInProfile(request.getParentId(), profileId);
            if (newParent != null && !Objects.equals(newParent.getId(), category.getParentId())) {
                checkMove(category, newParent, profileId);
            }
        }

        boolean parentChanged = !Objects.equals(idOf(newParent), category.getParentId());
        boolean nameChanged = !newName.equals(category.getName());
        if (parentChanged || nameChanged) {
            requireNameFree(profileId, newParent, newName);
        }

        category.rename(newName);
        category.moveTo(newParent);
        categoryRepository.save(category);

        // Rebuild from the flat list so the response carries the moved subtree with correct depths.
        return CategoryTreeBuilder.subtree(categoryRepository.findAllByProfileIdOrderByNameAsc(profileId), id);
    }

    public void delete(Long id) {
        Long profileId = activeProfile.requireId();
        Category category = findInProfile(id, profileId);

        // Checked up front so the FK ON DELETE RESTRICT never surfaces as a 500.
        long children = categoryRepository.countByParentId(id);
        long transactions = transactionRepository.countByCategoryId(id);
        long budgets = budgetRepository.countByCategoryId(id);
        if (children > 0 || transactions > 0 || budgets > 0) {
            throw new CategoryInUseException(category.getName(), children, transactions, budgets);
        }
        categoryRepository.delete(category);
    }

    /** Cycle and depth rules for reparenting {@code category} under {@code newParent} (docs/SCHEMA.md). */
    private void checkMove(Category category, Category newParent, Long profileId) {
        if (categoryRepository.findSubtreeIds(category.getId(), profileId).contains(newParent.getId())) {
            throw new CategoryCycleException(category.getName());
        }
        int height = categoryRepository.findSubtreeHeight(category.getId(), profileId).orElse(1);
        int resultingDepth = depthOf(newParent, profileId) + height;
        if (resultingDepth > MAX_DEPTH) {
            throw new CategoryDepthExceededException(MAX_DEPTH, resultingDepth,
                    "Moving '" + category.getName() + "' under '" + newParent.getName()
                            + "' would place its deepest subcategory at level " + resultingDepth
                            + ". The maximum is " + MAX_DEPTH + ".");
        }
    }

    private void requireNameFree(Long profileId, Category parent, String name) {
        boolean taken = parent == null
                ? categoryRepository.existsByProfileIdAndParentIsNullAndName(profileId, name)
                : categoryRepository.existsByProfileIdAndParentIdAndName(profileId, parent.getId(), name);
        if (taken) {
            throw new CategoryNameTakenException(name);
        }
    }

    private static void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("'name' must not be blank.");
        }
        if (name.length() > MAX_NAME_LENGTH) {
            throw new InvalidRequestException("'name' must be at most " + MAX_NAME_LENGTH + " characters.");
        }
    }

    private Category findInProfile(Long id, Long profileId) {
        return categoryRepository.findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("category", id));
    }

    private int depthOf(Category category, Long profileId) {
        return categoryRepository.findDepth(category.getId(), profileId).orElse(1);
    }

    private static Long idOf(Category category) {
        return category == null ? null : category.getId();
    }
}

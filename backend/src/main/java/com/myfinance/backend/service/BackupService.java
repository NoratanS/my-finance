package com.myfinance.backend.service;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.myfinance.backend.dto.BackupFile;
import com.myfinance.backend.dto.BackupRestoreResponse;
import com.myfinance.backend.exception.BackupInvalidException;
import com.myfinance.backend.exception.InvalidBackupFileException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.CurrentUser;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Backup export and restore (docs/API.md "Backup"). Like {@code ProfileService}, this sits
 * <em>above</em> the profile boundary: both operations are scoped to the authenticated user and
 * need no active profile. The request names profile ids, and any id not owned by the session's
 * user is a 404 — never an existence oracle for other users' profiles.
 */
@Service
@Transactional(readOnly = true)
public class BackupService {

    private final ProfileRepository profileRepository;
    private final CategoryRepository categoryRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TransactionRepository transactionRepository;
    private final BudgetRepository budgetRepository;
    private final UserRepository userRepository;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final JsonMapper jsonMapper;

    public BackupService(
            ProfileRepository profileRepository,
            CategoryRepository categoryRepository,
            SubscriptionRepository subscriptionRepository,
            TransactionRepository transactionRepository,
            BudgetRepository budgetRepository,
            UserRepository userRepository,
            CurrentUser currentUser,
            Clock clock,
            JsonMapper jsonMapper) {
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
        this.userRepository = userRepository;
        this.currentUser = currentUser;
        this.clock = clock;
        this.jsonMapper = jsonMapper;
    }

    // ---------------------------------------------------------------- export

    public BackupFile export(List<Long> profileIds) {
        Long userId = currentUser.id();
        List<BackupFile.ProfileData> profiles = new ArrayList<>();
        for (Long profileId : new LinkedHashSet<>(profileIds)) {
            Profile profile = profileRepository
                    .findByIdAndUserId(profileId, userId)
                    .orElseThrow(() -> new ResourceNotFoundException("profile", profileId));
            profiles.add(exportProfile(profile));
        }
        return new BackupFile(BackupFile.APP, BackupFile.FORMAT_VERSION, clock.instant(), profiles);
    }

    private BackupFile.ProfileData exportProfile(Profile profile) {
        return new BackupFile.ProfileData(
                profile.getName(),
                profile.getDefaultCurrency(),
                exportCategories(profile.getId()),
                subscriptionRepository.findAllByProfileIdOrderByIdAsc(profile.getId()).stream()
                        .map(s -> new BackupFile.SubscriptionData(
                                s.getId(),
                                s.getCategory().getId(),
                                s.getName(),
                                s.getAmount(),
                                s.getCurrency(),
                                s.getBillingPeriod().name(),
                                s.getNextBillingOn().toString(),
                                s.getStatus().name(),
                                s.getNotes()))
                        .toList(),
                transactionRepository.findAllByProfileIdOrderByIdAsc(profile.getId()).stream()
                        .map(t -> new BackupFile.TransactionData(
                                t.getCategory().getId(),
                                t.getSubscriptionId(),
                                t.getAmount(),
                                t.getCurrency(),
                                t.getType().name(),
                                t.getOccurredOn().toString(),
                                t.getDescription(),
                                t.getMerchant()))
                        .toList(),
                budgetRepository.findAllByProfileIdOrderByIdAsc(profile.getId()).stream()
                        .map(b -> new BackupFile.BudgetData(
                                b.getCategory().getId(),
                                b.getAmountLimit(),
                                b.getCurrency(),
                                b.getPeriodStart().toString(),
                                b.getPeriodEnd().toString()))
                        .toList());
    }

    /**
     * Breadth-first over the adjacency list, so parents always precede their children in the file
     * — the ordering the restorer requires. Sorting by id would not be enough: a reparented
     * category can have a parent with a higher id than its own.
     */
    private List<BackupFile.CategoryData> exportCategories(Long profileId) {
        Map<Long, List<Category>> byParent = new LinkedHashMap<>();
        for (Category category : categoryRepository.findAllByProfileIdOrderByNameAsc(profileId)) {
            byParent.computeIfAbsent(category.getParentId(), parent -> new ArrayList<>())
                    .add(category);
        }
        List<BackupFile.CategoryData> ordered = new ArrayList<>();
        Deque<Category> queue = new ArrayDeque<>(byParent.getOrDefault(null, List.of()));
        while (!queue.isEmpty()) {
            Category category = queue.poll();
            ordered.add(new BackupFile.CategoryData(
                    category.getId(), category.getParentId(), category.getName(), category.getColor()));
            queue.addAll(byParent.getOrDefault(category.getId(), List.of()));
        }
        return ordered;
    }

    // ---------------------------------------------------------------- restore

    /**
     * One database transaction for the whole upload: a half-restored backup is worse than a failed
     * restore, so any error rolls everything back. Always creates new profiles — never merges.
     */
    @Transactional
    public BackupRestoreResponse restore(MultipartFile file) {
        BackupFile backup = parse(file);
        if (!BackupFile.APP.equals(backup.app())) {
            throw new InvalidBackupFileException("The file is not a my-finance backup.");
        }
        if (backup.formatVersion() == null || backup.formatVersion() != BackupFile.FORMAT_VERSION) {
            throw new InvalidBackupFileException("Unsupported backup format version " + backup.formatVersion()
                    + "; this server supports version " + BackupFile.FORMAT_VERSION + ".");
        }
        List<String> problems = BackupValidator.validate(backup);
        if (!problems.isEmpty()) {
            throw new BackupInvalidException(problems);
        }

        Long userId = currentUser.id();
        User owner = userRepository.getReferenceById(userId);
        LocalDate today = LocalDate.now(clock);
        List<BackupRestoreResponse.RestoredProfile> restored = new ArrayList<>();
        for (BackupFile.ProfileData data : backup.profiles()) {
            restored.add(restoreProfile(owner, userId, data, today));
        }
        return new BackupRestoreResponse(restored);
    }

    private BackupFile parse(MultipartFile file) {
        BackupFile backup;
        try {
            backup = jsonMapper.readValue(file.getBytes(), BackupFile.class);
        } catch (JacksonException | IOException e) {
            throw new InvalidBackupFileException("The file could not be parsed as a my-finance backup.");
        }
        if (backup == null) {
            // The JSON literal "null" parses successfully to null — no more a backup than non-JSON.
            throw new InvalidBackupFileException("The file could not be parsed as a my-finance backup.");
        }
        return backup;
    }

    private BackupRestoreResponse.RestoredProfile restoreProfile(
            User owner, Long userId, BackupFile.ProfileData data, LocalDate today) {
        String name = uniqueProfileName(data.name(), n -> profileRepository.existsByUserIdAndName(userId, n));
        Profile profile = profileRepository.save(new Profile(owner, name, data.defaultCurrency()));

        // Ref remapping: file refs are stitched to the freshly generated ids. Categories arrive
        // parents-first (the validator enforced it), so a single pass resolves every parent.
        Map<Long, Category> categoriesByRef = new HashMap<>();
        for (BackupFile.CategoryData category : orEmpty(data.categories())) {
            Category parent = category.parentRef() == null ? null : categoriesByRef.get(category.parentRef());
            categoriesByRef.put(
                    category.ref(),
                    categoryRepository.save(new Category(profile, parent, category.name(), category.color())));
        }
        Map<Long, Subscription> subscriptionsByRef = new HashMap<>();
        for (BackupFile.SubscriptionData subscription : orEmpty(data.subscriptions())) {
            subscriptionsByRef.put(
                    subscription.ref(),
                    subscriptionRepository.save(toSubscription(profile, categoriesByRef, subscription, today)));
        }
        for (BackupFile.TransactionData transaction : orEmpty(data.transactions())) {
            Subscription subscription = transaction.subscriptionRef() == null
                    ? null
                    : subscriptionsByRef.get(transaction.subscriptionRef());
            transactionRepository.save(new Transaction(
                    profile,
                    categoriesByRef.get(transaction.categoryRef()),
                    transaction.amount(),
                    transaction.currency(),
                    TransactionType.valueOf(transaction.type()),
                    LocalDate.parse(transaction.occurredOn()),
                    transaction.description(),
                    transaction.merchant(),
                    subscription));
        }
        for (BackupFile.BudgetData budget : orEmpty(data.budgets())) {
            budgetRepository.save(new Budget(
                    profile,
                    categoriesByRef.get(budget.categoryRef()),
                    budget.amountLimit(),
                    budget.currency(),
                    LocalDate.parse(budget.periodStart()),
                    LocalDate.parse(budget.periodEnd())));
        }
        return new BackupRestoreResponse.RestoredProfile(
                profile.getId(),
                name,
                orEmpty(data.categories()).size(),
                orEmpty(data.transactions()).size(),
                orEmpty(data.budgets()).size(),
                orEmpty(data.subscriptions()).size());
    }

    private static Subscription toSubscription(
            Profile profile, Map<Long, Category> categoriesByRef, BackupFile.SubscriptionData data, LocalDate today) {
        Category category = categoriesByRef.get(data.categoryRef());
        BillingPeriod period = BillingPeriod.valueOf(data.billingPeriod());
        SubscriptionStatus status = SubscriptionStatus.valueOf(data.status());
        LocalDate nextBillingOn = LocalDate.parse(data.nextBillingOn());
        if (status == SubscriptionStatus.ACTIVE) {
            // A past date would look "overdue" to the charge job, which would post catch-up charges
            // the file's transactions already contain — resume on cadence instead (docs/API.md).
            nextBillingOn = period.advanceToAtLeast(nextBillingOn, today);
        }
        Subscription subscription = new Subscription(
                profile, category, data.name(), data.amount(), data.currency(), period, nextBillingOn, data.notes());
        if (status != SubscriptionStatus.ACTIVE) {
            subscription.update(
                    category, data.name(), data.amount(), data.currency(), period, nextBillingOn, status, data.notes());
        }
        return subscription;
    }

    /** "Personal" → "Personal (restored)" → "Personal (restored 2)" → ... (docs/API.md "Backup"). */
    static String uniqueProfileName(String base, Predicate<String> taken) {
        if (!taken.test(base)) {
            return base;
        }
        String candidate = suffixed(base, " (restored)");
        for (int i = 2; taken.test(candidate); i++) {
            candidate = suffixed(base, " (restored " + i + ")");
        }
        return candidate;
    }

    /**
     * Truncates {@code base} so the suffixed name stays within the profile-name limit —
     * otherwise a profile restored from our own export could not be exported and re-imported
     * (the validator's name-length rule would reject it).
     */
    private static String suffixed(String base, String suffix) {
        int room = BackupValidator.MAX_NAME_LENGTH - suffix.length();
        return (base.length() <= room ? base : base.substring(0, room)) + suffix;
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}

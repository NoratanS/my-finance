package com.myfinance.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.myfinance.backend.dto.BackupFile;
import com.myfinance.backend.dto.CurrencyCode;
import com.myfinance.backend.dto.HexColor;
import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Money;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.TransactionType;

/**
 * Content rules for an uploaded backup file (docs/API.md "POST /api/backup/restore"): the same
 * value rules as the normal write endpoints (amount scale and positivity, ISO 4217 currency,
 * name lengths, category depth, sibling-name uniqueness) plus file-level integrity (dangling or
 * duplicate refs, parents-before-children ordering). Every violation becomes one human-readable
 * string pinpointing the entry; a non-empty result is a 422 {@code /errors/backup-invalid}.
 * <p>
 * The wording is restore's own, but the money, currency and colour checks read their parameters
 * from the value rules' one home ({@link Money}, {@link CurrencyCode}, {@link HexColor}), and
 * {@code BackupValidatorTest} holds restore and the request rules to one table of values.
 * <p>
 * Pure static functions over the parsed file — nothing here touches the database.
 */
final class BackupValidator {

    private static final Pattern CURRENCY = Pattern.compile(CurrencyCode.REGEX);
    private static final Pattern COLOR = Pattern.compile(HexColor.REGEX);
    static final int MAX_NAME_LENGTH = 100;
    private static final int MAX_TEXT_LENGTH = 500;
    /**
     * Ceiling on collected problems: a 20MB file of millions of empty entries would otherwise
     * build a list of tens of millions of strings (OOM) and a multi-hundred-MB 422 body. Each
     * entry loop stops once the cap is reached; {@link #validate} trims to the cap and appends
     * one marker entry.
     */
    private static final int MAX_PROBLEMS = 100;

    private BackupValidator() {}

    static List<String> validate(BackupFile backup) {
        List<String> problems = new ArrayList<>();
        if (backup.profiles() == null) {
            problems.add("profiles: is required");
            return problems;
        }
        for (int p = 0; p < backup.profiles().size() && problems.size() < MAX_PROBLEMS; p++) {
            validateProfile(backup.profiles().get(p), "profiles[" + p + "]", problems);
        }
        if (problems.size() >= MAX_PROBLEMS) {
            problems = new ArrayList<>(problems.subList(0, MAX_PROBLEMS));
            problems.add("... further problems omitted");
        }
        return problems;
    }

    private static void validateProfile(BackupFile.ProfileData profile, String at, List<String> problems) {
        checkName(at + ".name", profile.name(), problems);
        checkCurrency(at + ".defaultCurrency", profile.defaultCurrency(), problems);

        Map<Long, Integer> categoryDepths = validateCategories(orEmpty(profile.categories()), at, problems);
        Set<Long> subscriptionRefs =
                validateSubscriptions(orEmpty(profile.subscriptions()), categoryDepths.keySet(), at, problems);
        validateTransactions(orEmpty(profile.transactions()), categoryDepths.keySet(), subscriptionRefs, at, problems);
        validateBudgets(orEmpty(profile.budgets()), categoryDepths.keySet(), at, problems);
    }

    /** Returns depth by ref for every well-formed category, used for the ref lookups that follow. */
    private static Map<Long, Integer> validateCategories(
            List<BackupFile.CategoryData> categories, String prefix, List<String> problems) {
        Map<Long, Integer> depthByRef = new HashMap<>();
        Set<SiblingKey> siblings = new HashSet<>();
        for (int i = 0; i < categories.size() && problems.size() < MAX_PROBLEMS; i++) {
            BackupFile.CategoryData category = categories.get(i);
            String at = prefix + ".categories[" + i + "]";
            checkName(at + ".name", category.name(), problems);
            if (category.color() != null && !COLOR.matcher(category.color()).matches()) {
                problems.add(at + ".color: " + HexColor.MESSAGE);
            }
            if (category.name() != null && !siblings.add(new SiblingKey(category.parentRef(), category.name()))) {
                problems.add(at + ": duplicate sibling name '" + category.name() + "'");
            }

            int depth = 1;
            if (category.parentRef() != null) {
                Integer parentDepth = depthByRef.get(category.parentRef());
                if (parentDepth == null) {
                    // Covers both dangling parents and forward references — parents must come first.
                    problems.add(at + ": parentRef " + category.parentRef() + " does not refer to an earlier category");
                    continue;
                }
                depth = parentDepth + 1;
                if (depth > CategoryService.MAX_DEPTH) {
                    problems.add(at + ": depth " + depth + " exceeds the maximum of " + CategoryService.MAX_DEPTH);
                }
            }
            if (category.ref() == null) {
                problems.add(at + ": ref is required");
            } else if (depthByRef.putIfAbsent(category.ref(), depth) != null) {
                problems.add(at + ": duplicate ref " + category.ref());
            }
        }
        return depthByRef;
    }

    private static Set<Long> validateSubscriptions(
            List<BackupFile.SubscriptionData> subscriptions,
            Set<Long> categoryRefs,
            String prefix,
            List<String> problems) {
        Set<Long> refs = new HashSet<>();
        Set<String> names = new HashSet<>();
        for (int i = 0; i < subscriptions.size() && problems.size() < MAX_PROBLEMS; i++) {
            BackupFile.SubscriptionData subscription = subscriptions.get(i);
            String at = prefix + ".subscriptions[" + i + "]";
            if (subscription.ref() == null) {
                problems.add(at + ": ref is required");
            } else if (!refs.add(subscription.ref())) {
                problems.add(at + ": duplicate ref " + subscription.ref());
            }
            checkRef(at + ".categoryRef", subscription.categoryRef(), categoryRefs, true, "category", problems);
            checkName(at + ".name", subscription.name(), problems);
            if (subscription.name() != null && !names.add(subscription.name())) {
                problems.add(at + ": duplicate subscription name '" + subscription.name() + "'");
            }
            checkAmount(at + ".amount", subscription.amount(), problems);
            checkCurrency(at + ".currency", subscription.currency(), problems);
            checkEnum(at + ".billingPeriod", subscription.billingPeriod(), BillingPeriod.class, problems);
            checkDate(at + ".nextBillingOn", subscription.nextBillingOn(), problems);
            checkEnum(at + ".status", subscription.status(), SubscriptionStatus.class, problems);
            checkLength(at + ".notes", subscription.notes(), problems);
        }
        return refs;
    }

    private static void validateTransactions(
            List<BackupFile.TransactionData> transactions,
            Set<Long> categoryRefs,
            Set<Long> subscriptionRefs,
            String prefix,
            List<String> problems) {
        for (int i = 0; i < transactions.size() && problems.size() < MAX_PROBLEMS; i++) {
            BackupFile.TransactionData transaction = transactions.get(i);
            String at = prefix + ".transactions[" + i + "]";
            checkRef(at + ".categoryRef", transaction.categoryRef(), categoryRefs, true, "category", problems);
            checkRef(
                    at + ".subscriptionRef",
                    transaction.subscriptionRef(),
                    subscriptionRefs,
                    false,
                    "subscription",
                    problems);
            checkAmount(at + ".amount", transaction.amount(), problems);
            checkCurrency(at + ".currency", transaction.currency(), problems);
            checkEnum(at + ".type", transaction.type(), TransactionType.class, problems);
            checkDate(at + ".occurredOn", transaction.occurredOn(), problems);
            checkLength(at + ".description", transaction.description(), problems);
            checkMerchant(at + ".merchant", transaction.merchant(), problems);
        }
    }

    private static void validateBudgets(
            List<BackupFile.BudgetData> budgets, Set<Long> categoryRefs, String prefix, List<String> problems) {
        Set<BudgetKey> seen = new HashSet<>();
        for (int i = 0; i < budgets.size() && problems.size() < MAX_PROBLEMS; i++) {
            BackupFile.BudgetData budget = budgets.get(i);
            String at = prefix + ".budgets[" + i + "]";
            checkRef(at + ".categoryRef", budget.categoryRef(), categoryRefs, true, "category", problems);
            checkAmount(at + ".amountLimit", budget.amountLimit(), problems);
            checkCurrency(at + ".currency", budget.currency(), problems);
            LocalDate start = checkDate(at + ".periodStart", budget.periodStart(), problems);
            LocalDate end = checkDate(at + ".periodEnd", budget.periodEnd(), problems);
            if (start != null && end != null && end.isBefore(start)) {
                problems.add(at + ": periodEnd must be on or after periodStart");
            }
            // Mirrors UNIQUE (profile_id, category_id, period_start, period_end) within the file.
            if (!seen.add(new BudgetKey(budget.categoryRef(), budget.periodStart(), budget.periodEnd()))) {
                problems.add(at + ": duplicate budget for the same category and period");
            }
        }
    }

    // ---------------------------------------------------------------- field checks

    private static void checkRef(
            String at, Long ref, Set<Long> known, boolean required, String target, List<String> problems) {
        if (ref == null) {
            if (required) {
                problems.add(at + ": is required");
            }
        } else if (!known.contains(ref)) {
            problems.add(at + ": " + ref + " does not match any " + target + " in this profile");
        }
    }

    private static void checkName(String at, String name, List<String> problems) {
        if (name == null || name.isBlank()) {
            problems.add(at + ": is required");
        } else if (name.length() > MAX_NAME_LENGTH) {
            problems.add(at + ": must be at most " + MAX_NAME_LENGTH + " characters");
        }
    }

    private static void checkLength(String at, String text, List<String> problems) {
        if (text != null && text.length() > MAX_TEXT_LENGTH) {
            problems.add(at + ": must be at most " + MAX_TEXT_LENGTH + " characters");
        }
    }

    /** Optional, and shorter than a description: mirrors CHECK (char_length(merchant) <= 100) in V5. */
    private static void checkMerchant(String at, String merchant, List<String> problems) {
        if (merchant != null && merchant.length() > MAX_NAME_LENGTH) {
            problems.add(at + ": must be at most " + MAX_NAME_LENGTH + " characters");
        }
    }

    private static void checkCurrency(String at, String currency, List<String> problems) {
        if (currency == null || !CURRENCY.matcher(currency).matches()) {
            problems.add(at + ": " + CurrencyCode.MESSAGE);
        }
    }

    /** The {@code @MoneyAmount} rule, in restore's own words. */
    private static void checkAmount(String at, BigDecimal amount, List<String> problems) {
        if (amount == null) {
            problems.add(at + ": is required");
            return;
        }
        if (amount.signum() <= 0) {
            problems.add(at + ": must be greater than 0");
        }
        if (amount.scale() > Money.SCALE) {
            problems.add(at + ": must have at most " + Money.SCALE + " decimal places");
        }
        if (amount.precision() - amount.scale() > Money.INTEGER_DIGITS) {
            problems.add(at + ": must have at most " + Money.INTEGER_DIGITS + " integer digits");
        }
    }

    private static LocalDate checkDate(String at, String date, List<String> problems) {
        if (date == null) {
            problems.add(at + ": is required");
            return null;
        }
        try {
            LocalDate parsed = LocalDate.parse(date);
            // LocalDate accepts years far outside Postgres DATE (and outside any sane billing
            // arithmetic); the export format only ever writes plain yyyy-MM-dd dates anyway.
            if (parsed.getYear() < 1 || parsed.getYear() > 9999) {
                problems.add(at + ": year must be between 1 and 9999");
                return null;
            }
            return parsed;
        } catch (DateTimeParseException e) {
            problems.add(at + ": '" + date + "' is not a valid date (yyyy-MM-dd)");
            return null;
        }
    }

    private static <E extends Enum<E>> void checkEnum(String at, String value, Class<E> type, List<String> problems) {
        if (value == null) {
            problems.add(at + ": is required");
            return;
        }
        if (Arrays.stream(type.getEnumConstants())
                .noneMatch(constant -> constant.name().equals(value))) {
            problems.add(at + ": '" + value + "' is not one of " + Arrays.toString(type.getEnumConstants()));
        }
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

    /** Records give equals/hashCode for free — same trick as SubscriptionService.CategoryCurrency. */
    private record SiblingKey(Long parentRef, String name) {}

    private record BudgetKey(Long categoryRef, String periodStart, String periodEnd) {}
}

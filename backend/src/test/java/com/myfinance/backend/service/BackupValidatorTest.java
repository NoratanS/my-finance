package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.myfinance.backend.dto.BackupFile;

/** Pure file-content rules of docs/API.md "POST /api/backup/restore" — no Spring context needed. */
class BackupValidatorTest {

    private static BackupFile file(BackupFile.ProfileData... profiles) {
        return new BackupFile("my-finance", 1, Instant.parse("2026-08-25T12:00:00Z"), List.of(profiles));
    }

    private static BackupFile.ProfileData profile(
            List<BackupFile.CategoryData> categories,
            List<BackupFile.SubscriptionData> subscriptions,
            List<BackupFile.TransactionData> transactions,
            List<BackupFile.BudgetData> budgets) {
        return new BackupFile.ProfileData("Personal", "PLN", categories, subscriptions, transactions, budgets);
    }

    private static BackupFile.CategoryData category(long ref, Long parentRef, String name) {
        return new BackupFile.CategoryData(ref, parentRef, name, null);
    }

    private static BackupFile.SubscriptionData subscription(long ref, long categoryRef, String name) {
        return new BackupFile.SubscriptionData(
                ref, categoryRef, name, new BigDecimal("43.0000"), "PLN", "MONTHLY", "2026-09-03", "ACTIVE", null);
    }

    private static BackupFile.TransactionData transaction(Long categoryRef, Long subscriptionRef, String amount) {
        return new BackupFile.TransactionData(
                categoryRef, subscriptionRef, new BigDecimal(amount), "PLN", "EXPENSE", "2026-08-03", null, null);
    }

    private static BackupFile.BudgetData budget(long categoryRef, String start, String end) {
        return new BackupFile.BudgetData(categoryRef, new BigDecimal("2000.0000"), "PLN", start, end);
    }

    @Test
    void wellFormedFileHasNoProblems() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Shopping"), category(4, 1L, "Stimulants")),
                List.of(subscription(12, 4, "Netflix")),
                List.of(transaction(4L, 12L, "43.0000"), transaction(1L, null, "34.9900")),
                List.of(budget(1, "2026-07-01", "2026-07-31"))));

        assertThat(BackupValidator.validate(backup)).isEmpty();
    }

    @Test
    void missingProfilesArrayIsAProblem() {
        BackupFile backup = new BackupFile("my-finance", 1, Instant.parse("2026-08-25T12:00:00Z"), null);

        assertThat(BackupValidator.validate(backup)).singleElement().asString().contains("profiles");
    }

    // ---------------------------------------------------------------- category refs and tree

    @Test
    void parentRefMustReferToAnEarlierCategory() {
        BackupFile backup = file(profile(
                List.of(category(1, 2L, "Child"), category(2, null, "Parent")), List.of(), List.of(), List.of()));

        assertThat(BackupValidator.validate(backup))
                .singleElement()
                .asString()
                .contains("profiles[0].categories[0]")
                .contains("parentRef");
    }

    @Test
    void danglingParentRefIsAProblem() {
        BackupFile backup = file(profile(List.of(category(1, 99L, "Orphan")), List.of(), List.of(), List.of()));

        assertThat(BackupValidator.validate(backup))
                .singleElement()
                .asString()
                .contains("profiles[0].categories[0]")
                .contains("99");
    }

    @Test
    void duplicateCategoryRefIsAProblem() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food"), category(1, null, "Rent")), List.of(), List.of(), List.of()));

        assertThat(BackupValidator.validate(backup))
                .singleElement()
                .asString()
                .contains("profiles[0].categories[1]")
                .contains("ref");
    }

    @Test
    void categoryDepthBeyondFiveIsAProblem() {
        BackupFile backup = file(profile(
                List.of(
                        category(1, null, "L1"),
                        category(2, 1L, "L2"),
                        category(3, 2L, "L3"),
                        category(4, 3L, "L4"),
                        category(5, 4L, "L5"),
                        category(6, 5L, "L6")),
                List.of(),
                List.of(),
                List.of()));

        assertThat(BackupValidator.validate(backup))
                .singleElement()
                .asString()
                .contains("profiles[0].categories[5]")
                .contains("depth");
    }

    @Test
    void duplicateSiblingNamesAreAProblemButSameNameUnderDifferentParentsIsNot() {
        BackupFile duplicates = file(profile(
                List.of(category(1, null, "Food"), category(2, null, "Food")), List.of(), List.of(), List.of()));
        assertThat(BackupValidator.validate(duplicates))
                .singleElement()
                .asString()
                .contains("profiles[0].categories[1]")
                .contains("Food");

        BackupFile differentParents = file(profile(
                List.of(
                        category(1, null, "Home"), category(2, null, "Work"),
                        category(3, 1L, "Food"), category(4, 2L, "Food")),
                List.of(),
                List.of(),
                List.of()));
        assertThat(BackupValidator.validate(differentParents)).isEmpty();
    }

    // ---------------------------------------------------------------- cross-collection refs

    @Test
    void subscriptionTransactionAndBudgetCategoryRefsMustResolve() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(subscription(10, 99, "Netflix")),
                List.of(transaction(98L, null, "10.0000")),
                List.of(budget(97, "2026-07-01", "2026-07-31"))));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(3);
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("subscriptions[0]").contains("99"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("transactions[0]").contains("98"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("budgets[0]").contains("97"));
    }

    @Test
    void danglingSubscriptionRefOnATransactionIsAProblem() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")), List.of(), List.of(transaction(1L, 55L, "10.0000")), List.of()));

        assertThat(BackupValidator.validate(backup))
                .singleElement()
                .asString()
                .contains("transactions[0]")
                .contains("55");
    }

    @Test
    void duplicateSubscriptionRefAndNameAreProblems() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(subscription(10, 1, "Netflix"), subscription(10, 1, "Netflix")),
                List.of(),
                List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(2);
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("subscriptions[1]").contains("ref"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("subscriptions[1]").contains("Netflix"));
    }

    // ---------------------------------------------------------------- field values

    @Test
    void amountsMustBePositiveWithAtMostFourDecimals() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(),
                List.of(
                        transaction(1L, null, "-1.0000"),
                        transaction(1L, null, "0"),
                        transaction(1L, null, "10.00001")),
                List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(3);
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("transactions[0]"));
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("transactions[1]"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("transactions[2]").contains("decimal"));
    }

    @Test
    void currencyMustBeAThreeLetterUppercaseCode() {
        BackupFile backup = file(new BackupFile.ProfileData(
                "Personal",
                "pln",
                List.of(),
                List.of(),
                List.of(new BackupFile.TransactionData(
                        null, null, new BigDecimal("10.0000"), "ZLOTY", "EXPENSE", "2026-08-03", null, null)),
                List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("defaultCurrency"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("transactions[0]").contains("currency"));
    }

    @Test
    void unknownEnumValuesAreProblems() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(new BackupFile.SubscriptionData(
                        10L,
                        1L,
                        "Netflix",
                        new BigDecimal("43.0000"),
                        "PLN",
                        "FORTNIGHTLY",
                        "2026-09-03",
                        "SOMETIMES",
                        null)),
                List.of(new BackupFile.TransactionData(
                        1L, null, new BigDecimal("10.0000"), "PLN", "TRANSFER", "2026-08-03", null, null)),
                List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(3);
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("FORTNIGHTLY"));
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("SOMETIMES"));
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("TRANSFER"));
    }

    @Test
    void invalidDatesAreProblems() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(new BackupFile.SubscriptionData(
                        10L, 1L, "Netflix", new BigDecimal("43.0000"), "PLN", "MONTHLY", "not-a-date", "ACTIVE", null)),
                List.of(new BackupFile.TransactionData(
                        1L, null, new BigDecimal("10.0000"), "PLN", "EXPENSE", "2026-13-01", null, null)),
                List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(2);
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("not-a-date"));
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("2026-13-01"));
    }

    @Test
    void datesOutsideYears1To9999AreProblems() {
        // Parseable LocalDates that Postgres DATE cannot store (and that would make restore's
        // nextBillingOn catch-up arithmetic pathological) are rejected up front, in every field.
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(new BackupFile.SubscriptionData(
                        10L,
                        1L,
                        "Netflix",
                        new BigDecimal("43.0000"),
                        "PLN",
                        "MONTHLY",
                        "-999999999-01-01",
                        "ACTIVE",
                        null)),
                List.of(new BackupFile.TransactionData(
                        1L, null, new BigDecimal("10.0000"), "PLN", "EXPENSE", "0000-12-31", null, null)),
                List.of(budget(1, "+10000-01-01", "0000-01-01"))));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(4);
        assertThat(problems)
                .anySatisfy(p -> assertThat(p)
                        .contains("subscriptions[0].nextBillingOn")
                        .contains("year must be between 1 and 9999"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p)
                        .contains("transactions[0].occurredOn")
                        .contains("year must be between 1 and 9999"));
        assertThat(problems)
                .anySatisfy(p ->
                        assertThat(p).contains("budgets[0].periodStart").contains("year must be between 1 and 9999"));
        assertThat(problems)
                .anySatisfy(p ->
                        assertThat(p).contains("budgets[0].periodEnd").contains("year must be between 1 and 9999"));
    }

    @Test
    void problemsAreCappedAt100WithAnOmissionMarker() {
        // 25 all-null transaction entries x 5 problems each = 125 raw problems. A 20MB file of
        // millions of "{}" entries must not build a multi-hundred-MB problem list, so validation
        // short-circuits at the cap and says so.
        List<BackupFile.TransactionData> transactions =
                Collections.nCopies(25, new BackupFile.TransactionData(null, null, null, null, null, null, null, null));
        BackupFile backup = file(profile(List.of(category(1, null, "Food")), List.of(), transactions, List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(101);
        assertThat(problems.subList(0, 100)).allSatisfy(p -> assertThat(p).contains("transactions["));
        assertThat(problems.get(100)).contains("further problems omitted");
    }

    @Test
    void merchantOver100CharactersIsAProblem() {
        BackupFile.TransactionData tooLong = new BackupFile.TransactionData(
                1L, null, new BigDecimal("10.0000"), "PLN", "EXPENSE", "2026-08-03", null, "L".repeat(101));
        BackupFile backup =
                file(profile(List.of(category(1, null, "Shopping")), List.of(), List.of(tooLong), List.of()));

        assertThat(BackupValidator.validate(backup))
                .singleElement()
                .asString()
                .contains("profiles[0].transactions[0].merchant")
                .contains("100");
    }

    @Test
    void namesMustBePresentAndAtMost100Characters() {
        BackupFile backup = file(new BackupFile.ProfileData(
                " ", "PLN", List.of(category(1, null, "x".repeat(101))), List.of(), List.of(), List.of()));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(2);
        assertThat(problems).anySatisfy(p -> assertThat(p).contains("profiles[0].name"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("categories[0]").contains("100"));
    }

    @Test
    void budgetPeriodMustNotEndBeforeItStartsAndDuplicatesAreProblems() {
        BackupFile backup = file(profile(
                List.of(category(1, null, "Food")),
                List.of(),
                List.of(),
                List.of(
                        budget(1, "2026-07-31", "2026-07-01"),
                        budget(1, "2026-08-01", "2026-08-31"),
                        budget(1, "2026-08-01", "2026-08-31"))));

        List<String> problems = BackupValidator.validate(backup);
        assertThat(problems).hasSize(2);
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("budgets[0]").contains("periodEnd"));
        assertThat(problems)
                .anySatisfy(p -> assertThat(p).contains("budgets[2]").contains("duplicate"));
    }
}

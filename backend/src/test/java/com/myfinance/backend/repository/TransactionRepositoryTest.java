package com.myfinance.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * The two merchant-backfill queries (docs/API.md "GET /api/transactions/merchant-suggestions",
 * "POST /api/transactions/merchant-backfill"): grouping/ordering, the {@code merchant IS NULL}
 * restriction, and profile scoping.
 */
@IntegrationTest
class TransactionRepositoryTest {

    private static final LocalDate ON = LocalDate.of(2026, 7, 21);

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;
    private Category groceries;
    private Profile otherProfile;
    private Category otherCategory;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        groceries = fixtures.category(profile, null, "Groceries");

        User otherUser = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(otherUser, "Other", "EUR");
        otherCategory = fixtures.category(otherProfile, null, "Office");
    }

    private void txn(Profile p, Category c, String amount, String description, String merchant) {
        fixtures.transaction(p, c, amount, "PLN", TransactionType.EXPENSE, ON, description, merchant);
    }

    // ---------------------------------------------------------------- findMerchantSuggestions

    @Test
    void groupsByDescriptionBiggestGroupFirst() {
        txn(profile, groceries, "10.00", "Biedronka", null);
        txn(profile, groceries, "11.00", "Biedronka", null);
        txn(profile, groceries, "12.00", "Biedronka", null);
        txn(profile, groceries, "13.00", "Lidl", null);
        txn(profile, groceries, "14.00", "Lidl", null);

        assertThat(transactionRepository.findMerchantSuggestions(profile.getId()))
                .extracting(MerchantSuggestionRow::getDescription, MerchantSuggestionRow::getTransactionCount)
                .containsExactly(tuple("Biedronka", 3L), tuple("Lidl", 2L));
    }

    @Test
    void excludesGroupsOfOne() {
        txn(profile, groceries, "10.00", "a one-off", null);
        txn(profile, groceries, "11.00", "Lidl", null);
        txn(profile, groceries, "12.00", "Lidl", null);

        assertThat(transactionRepository.findMerchantSuggestions(profile.getId()))
                .extracting(MerchantSuggestionRow::getDescription)
                .containsExactly("Lidl");
    }

    @Test
    void excludesRowsThatAlreadyHaveAMerchant() {
        txn(profile, groceries, "10.00", "Biedronka", "Biedronka");
        txn(profile, groceries, "11.00", "Biedronka", "Biedronka");

        assertThat(transactionRepository.findMerchantSuggestions(profile.getId()))
                .isEmpty();
    }

    @Test
    void isScopedToTheProfile() {
        txn(otherProfile, otherCategory, "10.00", "Biedronka", null);
        txn(otherProfile, otherCategory, "11.00", "Biedronka", null);

        assertThat(transactionRepository.findMerchantSuggestions(profile.getId()))
                .isEmpty();
        assertThat(transactionRepository.findMerchantSuggestions(otherProfile.getId()))
                .extracting(MerchantSuggestionRow::getDescription)
                .containsExactly("Biedronka");
    }

    // ---------------------------------------------------------- findAllByProfileIdAndMerchantIsNullAndDescription

    @Test
    void findsOnlyUnlabelledRowsWithTheExactDescriptionInTheProfile() {
        Transaction unlabelled1 = fixtures.transaction(
                profile, groceries, "10.00", "PLN", TransactionType.EXPENSE, ON, "Biedronka", null);
        Transaction unlabelled2 = fixtures.transaction(
                profile, groceries, "11.00", "PLN", TransactionType.EXPENSE, ON, "Biedronka", null);
        txn(profile, groceries, "12.00", "Biedronka", "Already set");
        txn(profile, groceries, "13.00", "Lidl", null);
        txn(otherProfile, otherCategory, "14.00", "Biedronka", null);

        assertThat(transactionRepository.findAllByProfileIdAndMerchantIsNullAndDescription(
                        profile.getId(), "Biedronka"))
                .extracting(Transaction::getId)
                .containsExactlyInAnyOrder(unlabelled1.getId(), unlabelled2.getId());
    }

    @Test
    void returnsEmptyWhenNothingMatches() {
        assertThat(transactionRepository.findAllByProfileIdAndMerchantIsNullAndDescription(
                        profile.getId(), "Nothing here"))
                .isEmpty();
    }
}

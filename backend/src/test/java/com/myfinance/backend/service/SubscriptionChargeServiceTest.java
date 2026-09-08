package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * The charge job (docs/SCHEMA.md "Charge posting"), exercised by calling
 * {@link SubscriptionChargeService#postDueCharges} directly with an explicit date — the
 * {@code @Scheduled} cron wiring in {@code SubscriptionChargeScheduler} is configuration, not
 * logic, and is deliberately not triggered from a test.
 */
@IntegrationTest
class SubscriptionChargeServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 17);

    @Autowired
    private SubscriptionChargeService chargeService;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private MockMvc mockMvc;

    private Profile profile;
    private Category streaming;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        streaming = fixtures.category(profile, null, "Streaming");
    }

    private Subscription subscription(
            String name, String amount, BillingPeriod period, LocalDate next, SubscriptionStatus status) {
        return fixtures.subscription(profile, streaming, name, amount, "PLN", period, next, status);
    }

    @Test
    void dueTodayPostsOneChargeAndAdvancesNextBilling() throws Exception {
        Subscription netflix = subscription("Netflix", "43", BillingPeriod.MONTHLY, TODAY, SubscriptionStatus.ACTIVE);

        int posted = chargeService.postDueCharges(TODAY);

        assertThat(posted).isEqualTo(1);
        List<Transaction> transactions = transactionRepository.findAll();
        assertThat(transactions).hasSize(1);
        Transaction charge = transactions.getFirst();
        assertThat(charge.getOccurredOn()).isEqualTo(TODAY);
        assertThat(charge.getDescription()).isEqualTo("Netflix");
        assertThat(charge.getAmount()).isEqualByComparingTo("43");
        assertThat(charge.getSubscriptionId()).isEqualTo(netflix.getId());
        assertThat(subscriptionRepository
                        .findById(netflix.getId())
                        .orElseThrow()
                        .getNextBillingOn())
                .isEqualTo(LocalDate.of(2026, 9, 17));
    }

    @Test
    void notYetDueIsNotCharged() {
        subscription("Netflix", "43", BillingPeriod.MONTHLY, TODAY.plusDays(1), SubscriptionStatus.ACTIVE);

        assertThat(chargeService.postDueCharges(TODAY)).isZero();
        assertThat(transactionRepository.findAll()).isEmpty();
    }

    @Test
    void threeWeeksOverduePostsThreeChargesWithHistoricalDates() {
        // Server down since before 2026-07-27: weekly sub is due 07-27, 08-03 and 08-10 by 08-16.
        Subscription gym =
                subscription("Gym", "25", BillingPeriod.WEEKLY, LocalDate.of(2026, 7, 27), SubscriptionStatus.ACTIVE);

        int posted = chargeService.postDueCharges(LocalDate.of(2026, 8, 10));

        assertThat(posted).isEqualTo(3);
        assertThat(transactionRepository.findAll().stream()
                        .map(Transaction::getOccurredOn)
                        .sorted(Comparator.naturalOrder()))
                .containsExactly(LocalDate.of(2026, 7, 27), LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 10));
        assertThat(subscriptionRepository.findById(gym.getId()).orElseThrow().getNextBillingOn())
                .isEqualTo(LocalDate.of(2026, 8, 17));
    }

    @Test
    void pausedAndCancelledSubscriptionsAreNeverCharged() {
        subscription("Paused Gym", "100", BillingPeriod.MONTHLY, TODAY.minusMonths(2), SubscriptionStatus.PAUSED);
        subscription("Old Paper", "20", BillingPeriod.MONTHLY, TODAY.minusMonths(2), SubscriptionStatus.CANCELLED);

        assertThat(chargeService.postDueCharges(TODAY)).isZero();
        assertThat(transactionRepository.findAll()).isEmpty();
    }

    @Test
    void secondRunPostsNothing() {
        subscription("Netflix", "43", BillingPeriod.MONTHLY, TODAY, SubscriptionStatus.ACTIVE);

        assertThat(chargeService.postDueCharges(TODAY)).isEqualTo(1);
        assertThat(chargeService.postDueCharges(TODAY)).isZero();
        assertThat(transactionRepository.findAll()).hasSize(1);
    }

    @Test
    void catchUpCapPostsExactly120AndTheNextRunContinues() {
        // 125 weeks overdue -> 126 charges due (today-125w .. today); the cap stops the first
        // run at MAX_CHARGES_PER_RUN and leaves nextBillingOn where the loop got to.
        Subscription gym =
                subscription("Gym", "25", BillingPeriod.WEEKLY, TODAY.minusWeeks(125), SubscriptionStatus.ACTIVE);

        assertThat(chargeService.postDueCharges(TODAY)).isEqualTo(SubscriptionChargePoster.MAX_CHARGES_PER_RUN);
        assertThat(transactionRepository.findAll()).hasSize(120);
        assertThat(subscriptionRepository.findById(gym.getId()).orElseThrow().getNextBillingOn())
                .isEqualTo(TODAY.minusWeeks(5));

        // The next run continues from there and finishes the catch-up.
        assertThat(chargeService.postDueCharges(TODAY)).isEqualTo(6);
        assertThat(transactionRepository.findAll()).hasSize(126);
        assertThat(subscriptionRepository.findById(gym.getId()).orElseThrow().getNextBillingOn())
                .isEqualTo(TODAY.plusWeeks(1));
    }

    @Test
    void postedChargeIsVisibleThroughTheApiAndCountsIntoBudgetStatus() throws Exception {
        Subscription netflix = subscription(
                "Netflix", "43", BillingPeriod.MONTHLY, LocalDate.of(2026, 8, 5), SubscriptionStatus.ACTIVE);
        Budget budget =
                fixtures.budget(profile, streaming, "100", "PLN", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31));

        chargeService.postDueCharges(TODAY);

        mockMvc.perform(get("/api/transactions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].type").value("EXPENSE"))
                .andExpect(jsonPath("$.content[0].occurredOn").value("2026-08-05"))
                .andExpect(jsonPath("$.content[0].description").value("Netflix"))
                .andExpect(jsonPath("$.content[0].subscriptionId").value(netflix.getId()))
                .andExpect(jsonPath("$.content[0].category.name").value("Streaming"));

        mockMvc.perform(get("/api/budgets/{id}/status", budget.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.spent").value("43.0000"))
                .andExpect(jsonPath("$.remaining").value("57.0000"));
    }

    @Test
    void chargesSubscriptionsAcrossAllProfilesInOneRun() {
        subscription("Netflix", "43", BillingPeriod.MONTHLY, TODAY, SubscriptionStatus.ACTIVE);
        User other = fixtures.user("other@example.com");
        Profile otherProfile = fixtures.profile(other, "Other", "EUR");
        Category otherCategory = fixtures.category(otherProfile, null, "Their Streaming");
        fixtures.subscription(
                otherProfile,
                otherCategory,
                "Their Netflix",
                "10",
                "EUR",
                BillingPeriod.MONTHLY,
                TODAY,
                SubscriptionStatus.ACTIVE);

        assertThat(chargeService.postDueCharges(TODAY)).isEqualTo(2);
    }
}

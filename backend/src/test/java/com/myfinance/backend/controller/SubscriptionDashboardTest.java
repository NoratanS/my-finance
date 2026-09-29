package com.myfinance.backend.controller;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * GET /api/subscriptions/dashboard (docs/API.md). The service reads the injected {@link Clock},
 * so the context gets a {@code Clock.fixed} at 2026-08-17 and every date computation is
 * deterministic.
 */
@IntegrationTest
class SubscriptionDashboardTest {

    private static final LocalDate AS_OF = LocalDate.of(2026, 8, 17);

    @TestConfiguration
    static class FixedClock {

        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(AS_OF.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;
    private Category streaming;
    private Category utilities;

    @BeforeEach
    void setUp() {
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        streaming = fixtures.category(profile, null, "Streaming");
        utilities = fixtures.category(profile, null, "Utilities");
    }

    private Subscription active(
            Category category, String name, String amount, String currency, BillingPeriod period, LocalDate next) {
        return fixtures.subscription(
                profile, category, name, amount, currency, period, next, SubscriptionStatus.ACTIVE);
    }

    @Test
    void emptyDashboardHasZeroCountsAndEmptyLists() throws Exception {
        mockMvc.perform(get("/api/subscriptions/dashboard").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.asOf").value("2026-08-17"))
                .andExpect(jsonPath("$.activeCount").value(0))
                .andExpect(jsonPath("$.pausedCount").value(0))
                .andExpect(jsonPath("$.monthlyCost").isEmpty())
                .andExpect(jsonPath("$.yearlyCost").isEmpty())
                .andExpect(jsonPath("$.chargedThisMonth").isEmpty())
                .andExpect(jsonPath("$.byCategory").isEmpty())
                .andExpect(jsonPath("$.upcoming").isEmpty())
                .andExpect(jsonPath("$.overdue").isEmpty());
    }

    @Test
    void dashboardComputesCountsCostsGroupsAndRenewals() throws Exception {
        // ACTIVE: 43 PLN/month + 120 PLN/year (=10) + 30 PLN/quarter (=10, overdue) + 10 USD/month
        active(streaming, "Netflix", "43", "PLN", BillingPeriod.MONTHLY, LocalDate.of(2026, 9, 3));
        active(utilities, "Domain", "120", "PLN", BillingPeriod.YEARLY, AS_OF); // due exactly today
        active(utilities, "Old Mag", "30", "PLN", BillingPeriod.QUARTERLY, LocalDate.of(2026, 8, 10)); // overdue
        active(streaming, "iCloud", "10", "USD", BillingPeriod.MONTHLY, LocalDate.of(2026, 9, 16)); // horizon edge
        // PAUSED: counted only in pausedCount, never in totals or renewals
        fixtures.subscription(
                profile,
                streaming,
                "Gym",
                "100",
                "PLN",
                BillingPeriod.MONTHLY,
                LocalDate.of(2026, 8, 20),
                SubscriptionStatus.PAUSED);
        // CANCELLED: invisible here
        fixtures.subscription(
                profile,
                streaming,
                "Old Paper",
                "20",
                "PLN",
                BillingPeriod.MONTHLY,
                LocalDate.of(2026, 8, 20),
                SubscriptionStatus.CANCELLED);

        mockMvc.perform(get("/api/subscriptions/dashboard").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.asOf").value("2026-08-17"))
                .andExpect(jsonPath("$.activeCount").value(4))
                .andExpect(jsonPath("$.pausedCount").value(1))
                // per-currency, never mixed: PLN 43+10+10, USD 10
                .andExpect(jsonPath("$.monthlyCost[*].currency").value(contains("PLN", "USD")))
                .andExpect(jsonPath("$.monthlyCost[0].amount").value("63.0000"))
                .andExpect(jsonPath("$.monthlyCost[1].amount").value("10.0000"))
                .andExpect(jsonPath("$.yearlyCost[0].amount").value("756.0000"))
                .andExpect(jsonPath("$.yearlyCost[1].amount").value("120.0000"))
                // grouped by category + currency, sorted by monthlyAmount DESC
                .andExpect(jsonPath("$.byCategory[*].monthlyAmount").value(contains("43.0000", "20.0000", "10.0000")))
                .andExpect(jsonPath("$.byCategory[0].category.name").value("Streaming"))
                .andExpect(jsonPath("$.byCategory[0].currency").value("PLN"))
                .andExpect(jsonPath("$.byCategory[1].category.name").value("Utilities"))
                .andExpect(jsonPath("$.byCategory[2].currency").value("USD"))
                // upcoming: asOf <= next <= asOf+30, soonest first, inclusive at both ends
                .andExpect(jsonPath("$.upcoming[*].name").value(contains("Domain", "Netflix", "iCloud")))
                .andExpect(jsonPath("$.upcoming[0].daysUntil").value(0))
                .andExpect(jsonPath("$.upcoming[1].daysUntil").value(17))
                .andExpect(jsonPath("$.upcoming[2].daysUntil").value(30))
                // overdue: ACTIVE with next < asOf — flagged, not hidden
                .andExpect(jsonPath("$.overdue[*].name").value(contains("Old Mag")))
                .andExpect(jsonPath("$.overdue[0].daysUntil").value(-7));
    }

    @Test
    void yearlyCostForAYearlySubscriptionIsExactNotCompoundedRounding() throws Exception {
        // D1: the old formula rounded 100/12 to a monthly equivalent of 8.3333, then x12 gave
        // 99.9996. The true yearly cost of a single YEARLY subscription needs no division at
        // all -- it must be exactly what was typed.
        active(streaming, "Yearly Sub", "100", "PLN", BillingPeriod.YEARLY, LocalDate.of(2026, 9, 3));

        mockMvc.perform(get("/api/subscriptions/dashboard").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.yearlyCost[0].amount").value("100.0000"));
    }

    @Test
    void yearlyCostForAWeeklySubscriptionUsesTheSame52WeekConventionAsMonthlyAmount() throws Exception {
        // The other rounding trap: a calendar year is really 52.18 weeks, but monthlyAmount's
        // WEEKLY formula (docs/API.md) already commits to 52 weeks/year, so yearlyCost must
        // stay consistent with that convention -- amount x 52, not amount x 52.1775.
        active(utilities, "Weekly Sub", "10", "PLN", BillingPeriod.WEEKLY, LocalDate.of(2026, 9, 3));

        mockMvc.perform(get("/api/subscriptions/dashboard").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.yearlyCost[0].amount").value("520.0000"));
    }

    @Test
    void chargedThisMonthSumsOnlySubscriptionLinkedExpensesOfTheCalendarMonth() throws Exception {
        Subscription netflix =
                active(streaming, "Netflix", "43", "PLN", BillingPeriod.MONTHLY, LocalDate.of(2026, 9, 3));
        Subscription icloud =
                active(streaming, "iCloud", "10", "USD", BillingPeriod.MONTHLY, LocalDate.of(2026, 9, 16));
        // counted: linked charges inside August
        fixtures.chargeTransaction(profile, streaming, "43", "PLN", LocalDate.of(2026, 8, 3), netflix);
        fixtures.chargeTransaction(profile, streaming, "10", "USD", LocalDate.of(2026, 8, 16), icloud);
        // not counted: last month's charge, and a manual (unlinked) August expense
        fixtures.chargeTransaction(profile, streaming, "43", "PLN", LocalDate.of(2026, 7, 3), netflix);
        fixtures.transaction(profile, streaming, "100", "PLN", TransactionType.EXPENSE, LocalDate.of(2026, 8, 10));

        mockMvc.perform(get("/api/subscriptions/dashboard").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chargedThisMonth[*].currency").value(contains("PLN", "USD")))
                .andExpect(jsonPath("$.chargedThisMonth[0].amount").value("43.0000"))
                .andExpect(jsonPath("$.chargedThisMonth[1].amount").value("10.0000"));
    }

    @Test
    void horizonDaysBoundsTheUpcomingWindowInclusively() throws Exception {
        active(streaming, "Netflix", "43", "PLN", BillingPeriod.MONTHLY, LocalDate.of(2026, 9, 3)); // +17 days

        mockMvc.perform(get("/api/subscriptions/dashboard")
                        .param("horizonDays", "17")
                        .with(fixtures.in(profile)))
                .andExpect(jsonPath("$.upcoming[*].name").value(contains("Netflix")));
        mockMvc.perform(get("/api/subscriptions/dashboard")
                        .param("horizonDays", "16")
                        .with(fixtures.in(profile)))
                .andExpect(jsonPath("$.upcoming").isEmpty());
    }

    @Test
    void horizonDaysOutOfRangeIs400() throws Exception {
        mockMvc.perform(get("/api/subscriptions/dashboard")
                        .param("horizonDays", "0")
                        .with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
        mockMvc.perform(get("/api/subscriptions/dashboard")
                        .param("horizonDays", "366")
                        .with(fixtures.in(profile)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void dashboardWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(get("/api/subscriptions/dashboard").with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }
}

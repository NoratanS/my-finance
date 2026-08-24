package com.myfinance.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

/**
 * Fires {@link SubscriptionChargeService#postDueCharges} daily at 00:05 UTC (docs/API.md
 * "Charge posting (no endpoint)"). A separate bean rather than a method on the service so the
 * call goes through the Spring proxy and {@code @Transactional} actually applies — a
 * {@code @Scheduled} method on the service itself would self-invoke past it. The catch-log
 * guard keeps one failing run from silently killing future runs; enabled by
 * {@code @EnableScheduling} on {@code ClockConfig}.
 */
@Component
public class SubscriptionChargeScheduler {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionChargeScheduler.class);

    private final SubscriptionChargeService chargeService;
    private final Clock clock;

    public SubscriptionChargeScheduler(SubscriptionChargeService chargeService, Clock clock) {
        this.chargeService = chargeService;
        this.clock = clock;
    }

    @Scheduled(cron = "0 5 0 * * *", zone = "UTC")
    public void postDueChargesDaily() {
        try {
            chargeService.postDueCharges(LocalDate.now(clock));
        } catch (Exception ex) {
            // Log and survive: the next day's run retries everything still due (the job is
            // idempotent by construction), and the scheduler thread stays healthy.
            log.error("Subscription charge run failed", ex);
        }
    }
}

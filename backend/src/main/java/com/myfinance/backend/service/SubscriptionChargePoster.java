package com.myfinance.backend.service;

import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Posts the due charges for ONE subscription in its own transaction. A separate collaborator
 * bean rather than a method on {@link SubscriptionChargeService} for the same reason the
 * scheduler is a separate bean: the call must cross a Spring proxy for
 * {@code @Transactional(REQUIRES_NEW)} to actually open a new transaction — a self-invocation
 * on the service would silently bypass it.
 * <p>
 * Per-subscription transactions mean one bad subscription (e.g. a data problem that makes the
 * insert fail) rolls back only its own charges; the loop in the service catches the failure
 * and the remaining subscriptions still get charged.
 */
@Service
public class SubscriptionChargePoster {

    /**
     * Catch-up cap per subscription per run: a weekly subscription untouched for years must not
     * flood one run (or one transaction) with unbounded inserts. When the cap is hit,
     * {@code nextBillingOn} stays wherever the loop got to — the next run continues from there.
     */
    static final int MAX_CHARGES_PER_RUN = 120;

    private static final Logger log = LoggerFactory.getLogger(SubscriptionChargePoster.class);

    private final SubscriptionRepository subscriptionRepository;
    private final TransactionRepository transactionRepository;

    public SubscriptionChargePoster(SubscriptionRepository subscriptionRepository,
                                    TransactionRepository transactionRepository) {
        this.subscriptionRepository = subscriptionRepository;
        this.transactionRepository = transactionRepository;
    }

    /**
     * Posts an EXPENSE transaction for every due billing date of {@code subscription} (capped at
     * {@link #MAX_CHARGES_PER_RUN}), advancing {@code nextBillingOn} one period at a time. Each
     * posted charge and the matching advance commit together in this new transaction, which is
     * what keeps the job idempotent — a rerun finds nothing due.
     *
     * @return the number of charges posted
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int chargeOne(Subscription subscription, LocalDate today) {
        // Reload inside THIS transaction: the caller's loop runs outside any transaction, so the
        // entity it passes is detached — mutations on it would never be flushed.
        Subscription managed = subscriptionRepository.findById(subscription.getId()).orElseThrow();
        int posted = 0;
        while (posted < MAX_CHARGES_PER_RUN && !managed.getNextBillingOn().isAfter(today)) {
            // A posted charge has no merchant: the subscription it came from is already on the row.
            transactionRepository.save(new Transaction(managed.getProfile(), managed.getCategory(),
                    managed.getAmount(), managed.getCurrency(), TransactionType.EXPENSE,
                    managed.getNextBillingOn(), managed.getName(), null, managed));
            managed.advanceNextBillingOn();
            posted++;
        }
        if (!managed.getNextBillingOn().isAfter(today)) {
            log.warn("Charge cap of {} hit for subscription '{}' (id {}); nextBillingOn left at {} — "
                            + "the next run continues from there",
                    MAX_CHARGES_PER_RUN, managed.getName(), managed.getId(), managed.getNextBillingOn());
        }
        return posted;
    }
}

package com.myfinance.backend.service;

import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Turns due subscriptions into transactions (docs/SCHEMA.md "Charge posting"). This is a system
 * job, not a request path: it runs across all profiles with no session in sight, so it takes no
 * {@code ActiveProfile} and its repository query is deliberately not profile-scoped.
 * <p>
 * The whole run is one transaction: each posted charge and the matching {@code nextBillingOn}
 * advance commit together, which is what makes the job idempotent — a rerun finds nothing due.
 */
@Service
public class SubscriptionChargeService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionChargeService.class);

    private final SubscriptionRepository subscriptionRepository;
    private final TransactionRepository transactionRepository;

    public SubscriptionChargeService(SubscriptionRepository subscriptionRepository,
                                     TransactionRepository transactionRepository) {
        this.subscriptionRepository = subscriptionRepository;
        this.transactionRepository = transactionRepository;
    }

    /**
     * Posts an EXPENSE transaction for every ACTIVE subscription with {@code nextBillingOn <= today},
     * advancing the date one period at a time until it is in the future — so a server that was down
     * for a week posts the missed charges with their real historical dates instead of skipping them.
     *
     * @return the number of charges posted
     */
    @Transactional
    public int postDueCharges(LocalDate today) {
        int posted = 0;
        for (Subscription subscription : subscriptionRepository
                .findAllByStatusAndNextBillingOnLessThanEqual(SubscriptionStatus.ACTIVE, today)) {
            while (!subscription.getNextBillingOn().isAfter(today)) {
                transactionRepository.save(new Transaction(subscription.getProfile(), subscription.getCategory(),
                        subscription.getAmount(), subscription.getCurrency(), TransactionType.EXPENSE,
                        subscription.getNextBillingOn(), subscription.getName(), subscription));
                subscription.advanceNextBillingOn();
                posted++;
            }
        }
        if (posted > 0) {
            log.info("Posted {} subscription charge(s) up to {}", posted, today);
        }
        return posted;
    }
}

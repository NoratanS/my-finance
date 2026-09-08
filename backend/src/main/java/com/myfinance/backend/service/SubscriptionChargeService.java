package com.myfinance.backend.service;

import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.repository.SubscriptionRepository;

/**
 * Turns due subscriptions into transactions (docs/SCHEMA.md "Charge posting"). This is a system
 * job, not a request path: it runs across all profiles with no session in sight, so it takes no
 * {@code ActiveProfile} and its repository query is deliberately not profile-scoped.
 * <p>
 * Deliberately NOT {@code @Transactional}: each subscription is charged in its own
 * {@code REQUIRES_NEW} transaction by {@link SubscriptionChargePoster}, so one failing
 * subscription rolls back only its own charges and the rest of the run continues.
 */
@Service
public class SubscriptionChargeService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionChargeService.class);

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionChargePoster chargePoster;

    public SubscriptionChargeService(
            SubscriptionRepository subscriptionRepository, SubscriptionChargePoster chargePoster) {
        this.subscriptionRepository = subscriptionRepository;
        this.chargePoster = chargePoster;
    }

    /**
     * Posts an EXPENSE transaction for every ACTIVE subscription with {@code nextBillingOn <= today},
     * advancing the date one period at a time until it is in the future — so a server that was down
     * for a week posts the missed charges with their real historical dates instead of skipping them
     * (capped at {@link SubscriptionChargePoster#MAX_CHARGES_PER_RUN} per subscription per run).
     * A failure on one subscription is logged and the loop continues with the rest.
     *
     * @return the number of charges posted
     */
    public int postDueCharges(LocalDate today) {
        int posted = 0;
        for (Subscription subscription :
                subscriptionRepository.findAllByStatusAndNextBillingOnLessThanEqual(SubscriptionStatus.ACTIVE, today)) {
            try {
                posted += chargePoster.chargeOne(subscription, today);
            } catch (Exception ex) {
                log.error(
                        "Failed to post charges for subscription '{}' (id {}) — continuing with the rest",
                        subscription.getName(),
                        subscription.getId(),
                        ex);
            }
        }
        if (posted > 0) {
            log.info("Posted {} subscription charge(s) up to {}", posted, today);
        }
        return posted;
    }
}

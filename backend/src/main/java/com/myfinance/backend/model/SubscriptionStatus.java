package com.myfinance.backend.model;

/**
 * Lifecycle of a subscription (docs/SCHEMA.md "subscription"): {@code ACTIVE} is charged by the
 * job and counted in totals; {@code PAUSED} is kept and shown but neither charged nor counted;
 * {@code CANCELLED} is a soft delete that keeps past charges linked.
 */
public enum SubscriptionStatus {
    ACTIVE,
    PAUSED,
    CANCELLED
}

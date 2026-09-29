package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * 503 — the analytics service did not answer. An operational state, not a bug (docs/API.md
 * "Status code summary"): the UI says "the analytics service isn't running" rather than
 * something scarier, and everything else in the app keeps working.
 */
public class AnalyticsUnavailableException extends ApiException {

    public AnalyticsUnavailableException() {
        super(
                HttpStatus.SERVICE_UNAVAILABLE,
                "analytics-unavailable",
                "Analytics service unavailable",
                "The analytics service is not reachable. Insights are unavailable until it is running.");
    }
}

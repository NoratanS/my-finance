package com.myfinance.backend.dto;

import java.time.LocalDate;

import com.myfinance.backend.model.TransactionType;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * The Transaction filter shared by {@code GET /api/transactions} and its aggregates {@code summary}
 * and {@code category-totals} (docs/API.md "Transactions"), bound by Spring from the query string.
 * <p>
 * Spring binds a query parameter to the component of the same name through this canonical
 * constructor, so the component names <em>are</em> the wire names: renaming one renames a query
 * parameter. Keep in mind while editing:
 * <ul>
 *   <li>{@code includeDescendants} is a nullable {@code Boolean}, normalised to {@code false} here,
 *       because the binder cannot leave a primitive unset: a {@code boolean} component would make
 *       every request that omits the parameter a 400. Its schema default states the same
 *       {@code false} for the OpenAPI document.</li>
 *   <li>The constructor must never throw: an exception while binding surfaces as a 500, not a 400.
 *       The filter's rules (from/to order, includeDescendants needs categoryId, the search term's
 *       length) are checked where it becomes a query, in {@code TransactionService}.</li>
 *   <li>No Bean Validation annotations: without {@code @Valid} they would never run, and with it
 *       their failures would answer {@code /errors/validation-failed} with an {@code errors} list
 *       instead of this API's single-sentence {@code /errors/invalid-request}.</li>
 * </ul>
 * Paging is not part of it: only the list pages.
 */
public record TransactionFilter(
        LocalDate from,
        LocalDate to,
        Long categoryId,
        @Schema(defaultValue = "false") Boolean includeDescendants,
        TransactionType type,
        String q) {

    public TransactionFilter {
        includeDescendants = includeDescendants != null && includeDescendants;
    }
}

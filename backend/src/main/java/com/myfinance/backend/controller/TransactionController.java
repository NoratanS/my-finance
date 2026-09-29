package com.myfinance.backend.controller;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.myfinance.backend.dto.CategoryTotal;
import com.myfinance.backend.dto.CategoryTransactionCount;
import com.myfinance.backend.dto.MerchantBackfillRequest;
import com.myfinance.backend.dto.MerchantBackfillResponse;
import com.myfinance.backend.dto.MerchantSuggestion;
import com.myfinance.backend.dto.PageResponse;
import com.myfinance.backend.dto.TransactionRequest;
import com.myfinance.backend.dto.TransactionResponse;
import com.myfinance.backend.dto.TransactionSummary;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.service.TransactionFilter;
import com.myfinance.backend.service.TransactionService;

/** docs/API.md "Transactions". Thin: bind + validate, delegate, map status. */
@RestController
@RequestMapping("/api/transactions")
public class TransactionController {

    private final TransactionService transactionService;

    public TransactionController(TransactionService transactionService) {
        this.transactionService = transactionService;
    }

    @PostMapping
    public ResponseEntity<TransactionResponse> create(@Valid @RequestBody TransactionRequest request) {
        TransactionResponse created = transactionService.create(request);
        return ResponseEntity.created(URI.create("/api/transactions/" + created.id()))
                .body(created);
    }

    @GetMapping
    public PageResponse<TransactionResponse> list(
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "false") boolean includeDescendants,
            @RequestParam(required = false) TransactionType type,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return transactionService.list(
                new TransactionFilter(from, to, categoryId, includeDescendants, type, q, page, size));
    }

    /**
     * Aggregates over every matching row, not over one page — see docs/API.md. They take the same
     * optional filters as the list above, minus paging.
     */
    @GetMapping("/summary")
    public List<TransactionSummary> summary(
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "false") boolean includeDescendants,
            @RequestParam(required = false) TransactionType type,
            @RequestParam(required = false) String q) {
        return transactionService.summary(new TransactionFilter(from, to, categoryId, includeDescendants, type, q));
    }

    @GetMapping("/category-counts")
    public List<CategoryTransactionCount> categoryCounts(@RequestParam(required = false) String q) {
        return transactionService.categoryCounts(new TransactionFilter(null, null, null, false, null, q));
    }

    @GetMapping("/category-totals")
    public List<CategoryTotal> categoryTotals(
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "false") boolean includeDescendants,
            @RequestParam(required = false) TransactionType type,
            @RequestParam(required = false) String q) {
        return transactionService.categoryTotals(
                new TransactionFilter(from, to, categoryId, includeDescendants, type, q));
    }

    // An exact path segment always beats a path variable, so these never collide with /{id}.
    @GetMapping("/merchant-suggestions")
    public List<MerchantSuggestion> merchantSuggestions() {
        return transactionService.merchantSuggestions();
    }

    @PostMapping("/merchant-backfill")
    public MerchantBackfillResponse backfillMerchant(@Valid @RequestBody MerchantBackfillRequest request) {
        return transactionService.backfillMerchant(request);
    }

    @GetMapping("/{id}")
    public TransactionResponse get(@PathVariable Long id) {
        return transactionService.get(id);
    }

    @PutMapping("/{id}")
    public TransactionResponse update(@PathVariable Long id, @Valid @RequestBody TransactionRequest request) {
        return transactionService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        transactionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

package com.myfinance.backend.controller;

import com.myfinance.backend.dto.PageResponse;
import com.myfinance.backend.dto.TransactionFilter;
import com.myfinance.backend.dto.TransactionRequest;
import com.myfinance.backend.dto.TransactionResponse;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.service.TransactionService;
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

import java.net.URI;
import java.time.LocalDate;

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
        return ResponseEntity.created(URI.create("/api/transactions/" + created.id())).body(created);
    }

    @GetMapping
    public PageResponse<TransactionResponse> list(@RequestParam(required = false) LocalDate from,
                                                  @RequestParam(required = false) LocalDate to,
                                                  @RequestParam(required = false) Long categoryId,
                                                  @RequestParam(defaultValue = "false") boolean includeDescendants,
                                                  @RequestParam(required = false) TransactionType type,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "50") int size) {
        return transactionService.list(new TransactionFilter(from, to, categoryId, includeDescendants, type, page, size));
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

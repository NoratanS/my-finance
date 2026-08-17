package com.myfinance.backend.controller;

import com.myfinance.backend.dto.BudgetRequest;
import com.myfinance.backend.dto.BudgetResponse;
import com.myfinance.backend.dto.BudgetStatusResponse;
import com.myfinance.backend.service.BudgetService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/budgets")
public class BudgetController {

    private final BudgetService budgetService;

    public BudgetController(BudgetService budgetService) {
        this.budgetService = budgetService;
    }

    @PostMapping
    public ResponseEntity<BudgetResponse> create(@Valid @RequestBody BudgetRequest request) {
        BudgetResponse created = budgetService.create(request);
        return ResponseEntity.created(URI.create("/api/budgets/" + created.id())).body(created);
    }

    @GetMapping
    public List<BudgetResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate activeOn,
            @RequestParam(required = false) Long categoryId) {
        return budgetService.list(activeOn, categoryId);
    }

    @GetMapping("/{id}/status")
    public BudgetStatusResponse status(@PathVariable Long id) {
        return budgetService.status(id);
    }
}

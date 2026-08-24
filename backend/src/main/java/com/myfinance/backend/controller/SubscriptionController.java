package com.myfinance.backend.controller;

import com.myfinance.backend.dto.SubscriptionDashboardResponse;
import com.myfinance.backend.dto.SubscriptionRequest;
import com.myfinance.backend.dto.SubscriptionResponse;
import com.myfinance.backend.dto.UpdateSubscriptionRequest;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.service.SubscriptionService;
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
import java.util.List;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    public SubscriptionController(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @PostMapping
    public ResponseEntity<SubscriptionResponse> create(@Valid @RequestBody SubscriptionRequest request) {
        SubscriptionResponse created = subscriptionService.create(request);
        return ResponseEntity.created(URI.create("/api/subscriptions/" + created.id())).body(created);
    }

    /** An unknown {@code status} value fails enum conversion → 400 via the global type-mismatch handler. */
    @GetMapping
    public List<SubscriptionResponse> list(@RequestParam(required = false) SubscriptionStatus status) {
        return subscriptionService.list(status);
    }

    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    @GetMapping("/dashboard")
    public SubscriptionDashboardResponse dashboard(@RequestParam(required = false) Integer horizonDays) {
        return subscriptionService.dashboard(horizonDays);
    }

    @GetMapping("/{id}")
    public SubscriptionResponse get(@PathVariable Long id) {
        return subscriptionService.get(id);
    }

    @PutMapping("/{id}")
    public SubscriptionResponse update(@PathVariable Long id, @Valid @RequestBody UpdateSubscriptionRequest request) {
        return subscriptionService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        subscriptionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

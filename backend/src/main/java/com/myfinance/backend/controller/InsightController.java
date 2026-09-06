package com.myfinance.backend.controller;

import com.myfinance.backend.dto.CapabilitiesResponse;
import com.myfinance.backend.dto.InsightRequest;
import com.myfinance.backend.dto.InsightResponse;
import com.myfinance.backend.dto.InterpretRequest;
import com.myfinance.backend.dto.NarrationResponse;
import com.myfinance.backend.service.InsightService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/insights")
public class InsightController {

    private final InsightService insightService;

    public InsightController(InsightService insightService) {
        this.insightService = insightService;
    }

    @PostMapping
    public ResponseEntity<InsightResponse> create(@Valid @RequestBody InsightRequest request) {
        InsightResponse created = insightService.create(request);
        return ResponseEntity.created(URI.create("/api/insights/" + created.id())).body(created);
    }

    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    @PostMapping("/execute")
    public JsonNode execute(@RequestBody JsonNode plan) {
        return insightService.execute(plan);
    }

    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    @GetMapping("/capabilities")
    public CapabilitiesResponse capabilities() {
        return insightService.capabilities();
    }

    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    /** Free text -> a draft plan the explorer opens as editable chips (Phase 5). */
    @PostMapping("/interpret")
    public JsonNode interpret(@Valid @RequestBody InterpretRequest request) {
        return insightService.interpret(request);
    }

    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    /** POST /api/insights/narrate — one sentence about what this plan's results show (Phase 5). */
    @PostMapping("/narrate")
    public NarrationResponse narrate(@RequestBody JsonNode plan) {
        return insightService.narrate(plan);
    }

    /** Unpaginated: a profile holds dozens of insights at most (docs/API.md "GET /api/insights"). */
    @GetMapping
    public List<InsightResponse> list() {
        return insightService.list();
    }

    @GetMapping("/{id}")
    public InsightResponse get(@PathVariable Long id) {
        return insightService.get(id);
    }

    @PutMapping("/{id}")
    public InsightResponse update(@PathVariable Long id, @Valid @RequestBody InsightRequest request) {
        return insightService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        insightService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

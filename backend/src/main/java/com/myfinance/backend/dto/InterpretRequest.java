package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

/**
 * POST /api/insights/interpret — free text, plus the plan being refined (or
 * null for a fresh question).
 *
 * <p>There is deliberately no {@code profileId}: the analytics service is told
 * which profile to read by the backend, from the session (ARCHITECTURE.md §3).
 *
 * <p>{@code text} is bounded at 500 characters: a question about one's finances
 * is a sentence, not a document, and this is the first point a user's free
 * text enters the system — the analytics service imposes no cap of its own,
 * so an unbounded string here would round-trip straight into the model prompt.
 */
public record InterpretRequest(@NotBlank @Size(max = 500) String text, JsonNode currentPlan) {}

package com.myfinance.backend.dto;

/**
 * Whether this instance can turn free text into a plan, and which model answers
 * (docs/API.md "GET /api/insights/capabilities"). Deserialized from the analytics service's
 * {@code GET /internal/v1/capabilities} and returned to the SPA unchanged; {@code model} is
 * null whenever {@code interpret} is false.
 */
public record CapabilitiesResponse(boolean interpret, String model) {}

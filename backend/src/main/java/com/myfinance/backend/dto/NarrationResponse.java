package com.myfinance.backend.dto;

/**
 * POST /api/insights/narrate. One field on purpose: the caption is the only thing the model
 * contributes. Every number in it was checked against the executed envelope by the analytics
 * service before it was returned (docs/INSIGHTS.md "The AI layer").
 */
public record NarrationResponse(String caption) {}

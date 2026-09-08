package com.myfinance.backend.dto;

import java.time.OffsetDateTime;

import com.myfinance.backend.model.Insight;

import tools.jackson.databind.JsonNode;

/** An insight as returned by every insight endpoint (docs/API.md "Insights"). */
public record InsightResponse(
        Long id, String name, JsonNode plan, JsonNode viz, boolean pinned, OffsetDateTime createdAt) {

    public static InsightResponse from(Insight insight) {
        return new InsightResponse(
                insight.getId(),
                insight.getName(),
                insight.getPlan(),
                insight.getViz(),
                insight.isPinned(),
                insight.getCreatedAt());
    }
}

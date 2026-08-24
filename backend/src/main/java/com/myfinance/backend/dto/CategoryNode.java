package com.myfinance.backend.dto;

import java.util.List;

/** One node of the category forest returned by the categories endpoints (docs/API.md "Categories"). */
public record CategoryNode(Long id, String name, Long parentId, int depth, List<CategoryNode> children) {
}

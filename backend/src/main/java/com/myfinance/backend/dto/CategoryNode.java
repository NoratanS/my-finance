package com.myfinance.backend.dto;

import java.util.List;

/**
 * One node of the category forest returned by the categories endpoints (docs/API.md "Categories").
 * {@code color} is the node's own raw value — {@code null} means "inherit", resolved client-side.
 */
public record CategoryNode(Long id, String name, Long parentId, String color, int depth, List<CategoryNode> children) {}

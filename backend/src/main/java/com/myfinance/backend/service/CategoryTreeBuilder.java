package com.myfinance.backend.service;

import com.myfinance.backend.dto.CategoryNode;
import com.myfinance.backend.model.Category;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Assembles {@link CategoryNode} trees from the flat, name-sorted list of a profile's categories.
 * One pass groups rows by parent id; a second pass recurses from the roots. Sibling order is the
 * order of the input list, so a name-sorted input yields name-sorted children.
 */
final class CategoryTreeBuilder {

    private CategoryTreeBuilder() {
    }

    /** The whole forest: roots (parent == null) with their descendants. */
    static List<CategoryNode> forest(List<Category> categories) {
        Map<Long, List<Category>> byParent = groupByParent(categories);
        return build(byParent, null, 1);
    }

    /** The subtree rooted at {@code rootId}, with absolute depths (i.e. counted from the forest root). */
    static CategoryNode subtree(List<Category> categories, Long rootId) {
        Category root = categories.stream()
                .filter(c -> c.getId().equals(rootId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Category " + rootId + " is not in the list"));
        Map<Long, List<Category>> byParent = groupByParent(categories);
        return toNode(root, byParent, depthOf(root, categories));
    }

    private static Map<Long, List<Category>> groupByParent(List<Category> categories) {
        Map<Long, List<Category>> byParent = new HashMap<>();
        for (Category category : categories) {
            byParent.computeIfAbsent(category.getParentId(), k -> new ArrayList<>()).add(category);
        }
        return byParent;
    }

    private static List<CategoryNode> build(Map<Long, List<Category>> byParent, Long parentId, int depth) {
        List<CategoryNode> nodes = new ArrayList<>();
        for (Category category : byParent.getOrDefault(parentId, List.of())) {
            nodes.add(toNode(category, byParent, depth));
        }
        return nodes;
    }

    private static CategoryNode toNode(Category category, Map<Long, List<Category>> byParent, int depth) {
        return new CategoryNode(category.getId(), category.getName(), category.getParentId(), depth,
                build(byParent, category.getId(), depth + 1));
    }

    /** Walks parent ids up to the root using only the ids in the list (no lazy loading needed). */
    private static int depthOf(Category category, List<Category> categories) {
        Map<Long, Long> parentIds = new HashMap<>();
        for (Category c : categories) {
            parentIds.put(c.getId(), c.getParentId());
        }
        int depth = 1;
        for (Long parentId = category.getParentId(); parentId != null; parentId = parentIds.get(parentId)) {
            depth++;
        }
        return depth;
    }
}

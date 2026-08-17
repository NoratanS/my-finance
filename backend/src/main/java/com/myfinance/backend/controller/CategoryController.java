package com.myfinance.backend.controller;

import com.myfinance.backend.dto.CategoryNode;
import com.myfinance.backend.dto.CreateCategoryRequest;
import com.myfinance.backend.dto.UpdateCategoryRequest;
import com.myfinance.backend.service.CategoryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<CategoryNode> list() {
        return categoryService.tree();
    }

    @PostMapping
    public ResponseEntity<CategoryNode> create(@Valid @RequestBody CreateCategoryRequest request) {
        CategoryNode created = categoryService.create(request);
        return ResponseEntity.created(URI.create("/api/categories/" + created.id())).body(created);
    }

    @PatchMapping("/{id}")
    public CategoryNode update(@PathVariable Long id, @RequestBody UpdateCategoryRequest request) {
        return categoryService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        categoryService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

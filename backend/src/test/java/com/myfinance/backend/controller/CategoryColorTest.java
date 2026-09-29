package com.myfinance.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * Category display color (migration V2, docs/API.md "Categories"). The server stores, validates
 * and echoes the raw value only — null means "inherit", resolved client-side.
 */
@IntegrationTest
class CategoryColorTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    // ---- POST /api/categories ----

    @Test
    void createWithColorReturnsIt() throws Exception {
        mockMvc.perform(post("/api/categories")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Shopping\",\"color\":\"#c3b3ee\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.color").value("#c3b3ee"));
    }

    @Test
    void createWithoutColorReturnsNull() throws Exception {
        mockMvc.perform(post("/api/categories")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Shopping\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.color").value((Object) null));
    }

    @Test
    void createWithInvalidColorIs400() throws Exception {
        mockMvc.perform(post("/api/categories")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Shopping\",\"color\":\"#C3B3EE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("color"));
    }

    // ---- PATCH /api/categories/{id} ----

    @Test
    void patchSetsColor() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        mockMvc.perform(patch("/api/categories/{id}", shopping.getId())
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"color\":\"#a4d9c6\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.color").value("#a4d9c6"))
                .andExpect(jsonPath("$.name").value("Shopping"));
    }

    @Test
    void patchWithExplicitNullClearsColorToInherit() throws Exception {
        Category shopping = createWithColor("Shopping", "#a4d9c6");
        mockMvc.perform(patch("/api/categories/{id}", shopping.getId())
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"color\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.color").value((Object) null));
    }

    @Test
    void patchWithoutColorLeavesItUnchanged() throws Exception {
        Category shopping = createWithColor("Shopping", "#a4d9c6");
        mockMvc.perform(patch("/api/categories/{id}", shopping.getId())
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Errands\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Errands"))
                .andExpect(jsonPath("$.color").value("#a4d9c6"));
    }

    @Test
    void patchWithInvalidColorIs400() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        mockMvc.perform(patch("/api/categories/{id}", shopping.getId())
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"color\":\"blue\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("colorValid"));
    }

    // ---- GET /api/categories ----

    @Test
    void treeReturnsRawColorsWithNullMeaningInherit() throws Exception {
        Category shopping = createWithColor("Shopping", "#c3b3ee");
        fixtures.category(profile, shopping, "Stimulants"); // no color of its own

        mockMvc.perform(get("/api/categories").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].color").value("#c3b3ee"))
                // no server-side inheritance resolution: the child stays null
                .andExpect(jsonPath("$[0].children[0].color").value((Object) null));
    }

    private Category createWithColor(String name, String color) throws Exception {
        Category category = fixtures.category(profile, null, name);
        mockMvc.perform(patch("/api/categories/{id}", category.getId())
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"color\":\"" + color + "\"}"))
                .andExpect(status().isOk());
        return category;
    }
}

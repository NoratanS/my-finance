package com.myfinance.backend.controller;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class CategoryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private CategoryRepository categoryRepository;

    private User user;
    private Profile profile;

    @BeforeEach
    void setUp() {
        user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Personal", "EUR");
    }

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    /** Builds a chain root > ... of the given length under {@code parent}; returns the nodes top-down. */
    private Category[] chain(Category parent, String prefix, int length) {
        Category[] nodes = new Category[length];
        Category current = parent;
        for (int i = 0; i < length; i++) {
            current = fixtures.category(profile, current, prefix + (i + 1));
            nodes[i] = current;
        }
        return nodes;
    }

    // ---------------------------------------------------------------- GET

    @Test
    void listReturnsEmptyArrayWhenProfileHasNoCategories() throws Exception {
        mockMvc.perform(get("/api/categories").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void listReturnsNestedForestSortedByName() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        fixtures.category(profile, null, "Rent");
        Category stimulants = fixtures.category(profile, shopping, "Stimulants");
        fixtures.category(profile, shopping, "Clothes");
        Category vaping = fixtures.category(profile, stimulants, "Vaping");

        // Another profile's categories must not leak in.
        Profile other = fixtures.profile(user, "Business", "EUR");
        fixtures.category(other, null, "Office");

        mockMvc.perform(get("/api/categories").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].name").value("Rent"))
                .andExpect(jsonPath("$[0].depth").value(1))
                .andExpect(jsonPath("$[0].parentId", nullValue()))
                .andExpect(jsonPath("$[0].children", hasSize(0)))
                .andExpect(jsonPath("$[1].name").value("Shopping"))
                .andExpect(jsonPath("$[1].id").value(shopping.getId()))
                .andExpect(jsonPath("$[1].children", hasSize(2)))
                .andExpect(jsonPath("$[1].children[0].name").value("Clothes"))
                .andExpect(jsonPath("$[1].children[1].name").value("Stimulants"))
                .andExpect(jsonPath("$[1].children[1].parentId").value(shopping.getId()))
                .andExpect(jsonPath("$[1].children[1].depth").value(2))
                .andExpect(jsonPath("$[1].children[1].children[0].id").value(vaping.getId()))
                .andExpect(jsonPath("$[1].children[1].children[0].depth").value(3))
                .andExpect(jsonPath("$[1].children[1].children[0].children", hasSize(0)));
    }

    @Test
    void listWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(get("/api/categories").with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void listUnauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- POST

    @Test
    void createRootReturns201WithLocationAndNode() throws Exception {
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"Rent\"}").with(fixtures.in(profile)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.matchesPattern("/api/categories/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Rent"))
                .andExpect(jsonPath("$.parentId", nullValue()))
                .andExpect(jsonPath("$.depth").value(1))
                .andExpect(jsonPath("$.children", hasSize(0)));

        assertThat(categoryRepository.findAllByProfileIdOrderByNameAsc(profile.getId())).hasSize(1);
    }

    @Test
    void createChildComputesDepth() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category stimulants = fixtures.category(profile, shopping, "Stimulants");

        mockMvc.perform(json(post("/api/categories"),
                        "{\"name\":\"Vaping\",\"parentId\":" + stimulants.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.parentId").value(stimulants.getId()))
                .andExpect(jsonPath("$.depth").value(3))
                .andExpect(jsonPath("$.children", hasSize(0)));
    }

    @Test
    void createWithBlankNameIs400ValidationFailed() throws Exception {
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"  \"}").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("name"));
    }

    @Test
    void createWithTooLongNameIs400() throws Exception {
        String name = "x".repeat(101);
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"" + name + "\"}").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void createWithUnknownParentIs404() throws Exception {
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"X\",\"parentId\":999}").with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    @Test
    void createWithParentFromAnotherUsersProfileIs404() throws Exception {
        User stranger = fixtures.user("stranger@example.com");
        Profile theirs = fixtures.profile(stranger, "Theirs", "USD");
        Category theirRoot = fixtures.category(theirs, null, "Secret");

        mockMvc.perform(json(post("/api/categories"),
                        "{\"name\":\"X\",\"parentId\":" + theirRoot.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
        assertThat(categoryRepository.findAllByProfileIdOrderByNameAsc(profile.getId())).isEmpty();
    }

    @Test
    void createDuplicateRootNameIs409() throws Exception {
        fixtures.category(profile, null, "Rent");
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"Rent\"}").with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-name-taken"));
    }

    @Test
    void createDuplicateSiblingNameIs409ButSameNameUnderOtherParentIsFine() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category food = fixtures.category(profile, null, "Food");
        fixtures.category(profile, shopping, "Other");

        mockMvc.perform(json(post("/api/categories"),
                        "{\"name\":\"Other\",\"parentId\":" + shopping.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-name-taken"));

        mockMvc.perform(json(post("/api/categories"),
                        "{\"name\":\"Other\",\"parentId\":" + food.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isCreated());

        // A root named like a child elsewhere is also fine.
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"Other\"}").with(fixtures.in(profile)))
                .andExpect(status().isCreated());
    }

    @Test
    void createAtDepth5IsAllowedButDepth6Is422() throws Exception {
        Category[] nodes = chain(null, "L", 4);

        mockMvc.perform(json(post("/api/categories"),
                        "{\"name\":\"L5\",\"parentId\":" + nodes[3].getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(5));

        Category level5 = categoryRepository.findAllByProfileIdOrderByNameAsc(profile.getId()).stream()
                .filter(c -> c.getName().equals("L5")).findFirst().orElseThrow();

        mockMvc.perform(json(post("/api/categories"),
                        "{\"name\":\"L6\",\"parentId\":" + level5.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/category-depth-exceeded"))
                .andExpect(jsonPath("$.maxDepth").value(5))
                .andExpect(jsonPath("$.resultingDepth").value(6));
    }

    @Test
    void createWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(json(post("/api/categories"), "{\"name\":\"Rent\"}").with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    // ---------------------------------------------------------------- PATCH

    @Test
    void renameOnlyLeavesParentUntouched() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category stimulants = fixtures.category(profile, shopping, "Stimulants");
        Category vaping = fixtures.category(profile, stimulants, "Vaping");

        mockMvc.perform(json(patch("/api/categories/" + stimulants.getId()), "{\"name\":\"Vices\"}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(stimulants.getId()))
                .andExpect(jsonPath("$.name").value("Vices"))
                .andExpect(jsonPath("$.parentId").value(shopping.getId()))
                .andExpect(jsonPath("$.depth").value(2))
                .andExpect(jsonPath("$.children", hasSize(1)))
                .andExpect(jsonPath("$.children[0].id").value(vaping.getId()))
                .andExpect(jsonPath("$.children[0].depth").value(3));
    }

    @Test
    void renameToOwnCurrentNameIsNotACollision() throws Exception {
        Category rent = fixtures.category(profile, null, "Rent");
        mockMvc.perform(json(patch("/api/categories/" + rent.getId()), "{\"name\":\"Rent\"}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rent"));
    }

    @Test
    void explicitNullParentIdMovesToRoot() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category stimulants = fixtures.category(profile, shopping, "Stimulants");
        fixtures.category(profile, stimulants, "Vaping");

        mockMvc.perform(json(patch("/api/categories/" + stimulants.getId()), "{\"parentId\":null}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Stimulants"))
                .andExpect(jsonPath("$.parentId", nullValue()))
                .andExpect(jsonPath("$.depth").value(1))
                .andExpect(jsonPath("$.children[0].name").value("Vaping"))
                .andExpect(jsonPath("$.children[0].depth").value(2));

        assertThat(categoryRepository.findById(stimulants.getId()).orElseThrow().getParentId()).isNull();
    }

    @Test
    void reparentUnderAnotherCategory() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category food = fixtures.category(profile, null, "Food");
        Category snacks = fixtures.category(profile, shopping, "Snacks");

        mockMvc.perform(json(patch("/api/categories/" + snacks.getId()), "{\"parentId\":" + food.getId() + "}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parentId").value(food.getId()))
                .andExpect(jsonPath("$.depth").value(2));
    }

    @Test
    void renameAndMoveTogetherChecksDestinationSiblings() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category food = fixtures.category(profile, null, "Food");
        fixtures.category(profile, food, "Snacks");
        Category treats = fixtures.category(profile, shopping, "Treats");

        // "Snacks" is free under Shopping but taken under Food.
        mockMvc.perform(json(patch("/api/categories/" + treats.getId()),
                        "{\"name\":\"Snacks\",\"parentId\":" + food.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-name-taken"));

        mockMvc.perform(json(patch("/api/categories/" + treats.getId()),
                        "{\"name\":\"Sweets\",\"parentId\":" + food.getId() + "}").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Sweets"))
                .andExpect(jsonPath("$.parentId").value(food.getId()));
    }

    @Test
    void renameCollidingWithSiblingIs409() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        fixtures.category(profile, shopping, "Clothes");
        Category shoes = fixtures.category(profile, shopping, "Shoes");

        mockMvc.perform(json(patch("/api/categories/" + shoes.getId()), "{\"name\":\"Clothes\"}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-name-taken"));
    }

    @Test
    void moveToRootCollidingWithRootNameIs409() throws Exception {
        fixtures.category(profile, null, "Food");
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category food = fixtures.category(profile, shopping, "Food");

        mockMvc.perform(json(patch("/api/categories/" + food.getId()), "{\"parentId\":null}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-name-taken"));
    }

    @Test
    void emptyPatchBodyIs400() throws Exception {
        Category rent = fixtures.category(profile, null, "Rent");
        mockMvc.perform(json(patch("/api/categories/" + rent.getId()), "{}").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("anyFieldSet"));
    }

    @Test
    void blankOrTooLongNameInPatchIs400() throws Exception {
        Category rent = fixtures.category(profile, null, "Rent");
        mockMvc.perform(json(patch("/api/categories/" + rent.getId()), "{\"name\":\"   \"}").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("nameValid"));
        mockMvc.perform(json(patch("/api/categories/" + rent.getId()), "{\"name\":null}").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("nameValid"));
        mockMvc.perform(json(patch("/api/categories/" + rent.getId()), "{\"name\":\"" + "x".repeat(101) + "\"}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("name"));
    }

    @Test
    void patchUnknownCategoryIs404() throws Exception {
        mockMvc.perform(json(patch("/api/categories/999"), "{\"name\":\"X\"}").with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    @Test
    void patchCategoryOfAnotherProfileIs404() throws Exception {
        User stranger = fixtures.user("stranger@example.com");
        Profile theirs = fixtures.profile(stranger, "Theirs", "USD");
        Category theirRoot = fixtures.category(theirs, null, "Secret");

        mockMvc.perform(json(patch("/api/categories/" + theirRoot.getId()), "{\"name\":\"Pwned\"}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
        assertThat(categoryRepository.findById(theirRoot.getId()).orElseThrow().getName()).isEqualTo("Secret");
    }

    @Test
    void patchWithNewParentFromAnotherProfileIs404() throws Exception {
        Category rent = fixtures.category(profile, null, "Rent");
        User stranger = fixtures.user("stranger@example.com");
        Profile theirs = fixtures.profile(stranger, "Theirs", "USD");
        Category theirRoot = fixtures.category(theirs, null, "Secret");

        mockMvc.perform(json(patch("/api/categories/" + rent.getId()), "{\"parentId\":" + theirRoot.getId() + "}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void movingUnderItselfOrDescendantIs422Cycle() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        Category stimulants = fixtures.category(profile, shopping, "Stimulants");
        Category vaping = fixtures.category(profile, stimulants, "Vaping");

        mockMvc.perform(json(patch("/api/categories/" + shopping.getId()), "{\"parentId\":" + vaping.getId() + "}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/category-cycle"));

        mockMvc.perform(json(patch("/api/categories/" + shopping.getId()), "{\"parentId\":" + shopping.getId() + "}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/category-cycle"));
    }

    @Test
    void movingThreeLevelSubtreeUnderLevelThreeParentIs422EvenThoughMovedNodeWouldBeLevel4() throws Exception {
        Category[] target = chain(null, "T", 3);          // T1 > T2 > T3 (T3 at depth 3)
        Category[] moved = chain(null, "M", 3);           // M1 > M2 > M3 (height 3)

        mockMvc.perform(json(patch("/api/categories/" + moved[0].getId()), "{\"parentId\":" + target[2].getId() + "}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/category-depth-exceeded"))
                .andExpect(jsonPath("$.maxDepth").value(5))
                .andExpect(jsonPath("$.resultingDepth").value(6));

        assertThat(categoryRepository.findById(moved[0].getId()).orElseThrow().getParentId()).isNull();
    }

    @Test
    void movingSubtreeWhoseDeepestNodeLandsExactlyAtLevel5Succeeds() throws Exception {
        Category[] target = chain(null, "T", 2);          // T2 at depth 2
        Category[] moved = chain(null, "M", 3);           // height 3 → deepest lands at 5

        mockMvc.perform(json(patch("/api/categories/" + moved[0].getId()), "{\"parentId\":" + target[1].getId() + "}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.depth").value(3))
                .andExpect(jsonPath("$.children[0].children[0].depth").value(5));
    }

    @Test
    void movingDeepSubtreeToRootIsAlwaysAllowed() throws Exception {
        Category[] target = chain(null, "T", 2);
        Category[] moved = chain(target[1], "M", 3);      // M3 at depth 5

        mockMvc.perform(json(patch("/api/categories/" + moved[0].getId()), "{\"parentId\":null}")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.depth").value(1))
                .andExpect(jsonPath("$.children[0].children[0].depth").value(3));
    }

    // ---------------------------------------------------------------- DELETE

    @Test
    void deleteLeafReturns204() throws Exception {
        Category rent = fixtures.category(profile, null, "Rent");
        mockMvc.perform(delete("/api/categories/" + rent.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNoContent());
        assertThat(categoryRepository.findById(rent.getId())).isEmpty();
    }

    @Test
    void deleteUnknownIs404() throws Exception {
        mockMvc.perform(delete("/api/categories/999").with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteCategoryOfAnotherProfileIs404() throws Exception {
        User stranger = fixtures.user("stranger@example.com");
        Profile theirs = fixtures.profile(stranger, "Theirs", "USD");
        Category theirRoot = fixtures.category(theirs, null, "Secret");

        mockMvc.perform(delete("/api/categories/" + theirRoot.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
        assertThat(categoryRepository.findById(theirRoot.getId())).isPresent();
    }

    @Test
    void deleteCategoryWithChildrenIs409InUse() throws Exception {
        Category shopping = fixtures.category(profile, null, "Shopping");
        fixtures.category(profile, shopping, "Clothes");
        fixtures.category(profile, shopping, "Shoes");

        mockMvc.perform(delete("/api/categories/" + shopping.getId()).with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-in-use"))
                .andExpect(jsonPath("$.childCategoryCount").value(2))
                .andExpect(jsonPath("$.transactionCount").value(0))
                .andExpect(jsonPath("$.budgetCount").value(0));
        assertThat(categoryRepository.findById(shopping.getId())).isPresent();
    }

    @Test
    void deleteCategoryWithTransactionsAndBudgetsIs409InUse() throws Exception {
        Category groceries = fixtures.category(profile, null, "Groceries");
        fixtures.transaction(profile, groceries, "12.50", "EUR", TransactionType.EXPENSE, LocalDate.of(2026, 1, 5));
        fixtures.budget(profile, groceries, "300", "EUR", LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

        mockMvc.perform(delete("/api/categories/" + groceries.getId()).with(fixtures.in(profile)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/category-in-use"))
                .andExpect(jsonPath("$.childCategoryCount").value(0))
                .andExpect(jsonPath("$.transactionCount").value(1))
                .andExpect(jsonPath("$.budgetCount").value(1));
    }

    @Test
    void deleteUnauthenticatedIs401() throws Exception {
        Category rent = fixtures.category(profile, null, "Rent");
        // CSRF token present (otherwise the CSRF filter answers 403 before authentication runs), no session.
        mockMvc.perform(delete("/api/categories/" + rent.getId()).with(TestFixtures::withCsrf))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("/errors/unauthenticated"));
        assertThat(categoryRepository.findById(rent.getId())).isPresent();
    }

    @Test
    void deleteWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(delete("/api/categories/1").with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }
}

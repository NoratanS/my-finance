package com.myfinance.backend.service;

import com.myfinance.backend.dto.CategoryNode;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CategoryTreeBuilderTest {

    private final Profile profile = new Profile(new User("a@b.c", "hash", "A"), "P", "EUR");
    private long nextId = 1;

    /** Entities never leave the JPA layer with a null id, so give them one by reflection. */
    private Category cat(Category parent, String name) {
        Category c = new Category(profile, parent, name);
        ReflectionTestUtils.setField(c, "id", nextId++);
        return c;
    }

    @Test
    void forestPreservesInputOrderAndComputesDepth() {
        Category rent = cat(null, "Rent");
        Category shopping = cat(null, "Shopping");
        Category clothes = cat(shopping, "Clothes");
        Category stimulants = cat(shopping, "Stimulants");
        Category vaping = cat(stimulants, "Vaping");
        // Already name-sorted, as the repository query returns it.
        List<Category> flat = List.of(clothes, rent, shopping, stimulants, vaping);

        List<CategoryNode> forest = CategoryTreeBuilder.forest(flat);

        assertThat(forest).extracting(CategoryNode::name).containsExactly("Rent", "Shopping");
        CategoryNode shoppingNode = forest.get(1);
        assertThat(shoppingNode.depth()).isEqualTo(1);
        assertThat(shoppingNode.parentId()).isNull();
        assertThat(shoppingNode.children()).extracting(CategoryNode::name).containsExactly("Clothes", "Stimulants");
        CategoryNode vapingNode = shoppingNode.children().get(1).children().get(0);
        assertThat(vapingNode.id()).isEqualTo(vaping.getId());
        assertThat(vapingNode.parentId()).isEqualTo(stimulants.getId());
        assertThat(vapingNode.depth()).isEqualTo(3);
        assertThat(vapingNode.children()).isEmpty();
    }

    @Test
    void forestOfNothingIsEmpty() {
        assertThat(CategoryTreeBuilder.forest(List.of())).isEmpty();
    }

    @Test
    void subtreeReturnsNodeWithAbsoluteDepthAndItsDescendants() {
        Category shopping = cat(null, "Shopping");
        Category stimulants = cat(shopping, "Stimulants");
        Category vaping = cat(stimulants, "Vaping");
        cat(null, "Rent");

        CategoryNode node = CategoryTreeBuilder.subtree(List.of(shopping, stimulants, vaping), stimulants.getId());

        assertThat(node.name()).isEqualTo("Stimulants");
        assertThat(node.depth()).isEqualTo(2);
        assertThat(node.children()).hasSize(1);
        assertThat(node.children().get(0).depth()).isEqualTo(3);
    }

    @Test
    void subtreeOfUnknownIdFails() {
        assertThatThrownBy(() -> CategoryTreeBuilder.subtree(List.of(), 42L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

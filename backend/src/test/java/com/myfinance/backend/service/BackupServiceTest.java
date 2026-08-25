package com.myfinance.backend.service;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The pure part of restore's "always create a new profile" rule (docs/API.md "POST
 * /api/backup/restore"): conflicting names get a " (restored)" suffix, then a counter.
 * The repository lookup is abstracted as a predicate, so this is a plain unit test.
 */
class BackupServiceTest {

    @Test
    void freeNameIsKeptUnchanged() {
        assertThat(BackupService.uniqueProfileName("Personal", name -> false)).isEqualTo("Personal");
    }

    @Test
    void takenNameGetsTheRestoredSuffix() {
        Set<String> taken = Set.of("Personal");
        assertThat(BackupService.uniqueProfileName("Personal", taken::contains))
                .isEqualTo("Personal (restored)");
    }

    @Test
    void furtherConflictsAreNumberedFromTwo() {
        Set<String> taken = Set.of("Personal", "Personal (restored)");
        assertThat(BackupService.uniqueProfileName("Personal", taken::contains))
                .isEqualTo("Personal (restored 2)");

        Set<String> moreTaken = Set.of("Personal", "Personal (restored)", "Personal (restored 2)");
        assertThat(BackupService.uniqueProfileName("Personal", moreTaken::contains))
                .isEqualTo("Personal (restored 3)");
    }

    @Test
    void suffixedNamesTruncateTheBaseToStayWithinTheNameLimit() {
        // A base already at the 100-char limit must round-trip: the suffixed name has to pass
        // the validator's own name-length rule on re-import, so the base is truncated first.
        String base = "x".repeat(100);
        String suffixed = BackupService.uniqueProfileName(base, Set.of(base)::contains);
        assertThat(suffixed).hasSize(100).startsWith("x".repeat(89)).endsWith(" (restored)");

        Set<String> taken = Set.of(base, suffixed);
        String numbered = BackupService.uniqueProfileName(base, taken::contains);
        assertThat(numbered).hasSize(100).startsWith("x".repeat(87)).endsWith(" (restored 2)");
        assertThat(taken).doesNotContain(numbered);
    }
}

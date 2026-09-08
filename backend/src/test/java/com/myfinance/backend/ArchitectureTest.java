package com.myfinance.backend;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Enforces the layering described in ARCHITECTURE.md: controllers talk to services, services talk
 * to repositories, nothing skips a layer. This is structural only — ArchUnit can prove a
 * controller never reaches a repository directly; it cannot prove a repository query is scoped to
 * the authenticated profile. That remains a human review concern (see ARCHITECTURE.md Section 3).
 *
 * <p>Test classes are excluded from analysis: a test like {@code TransactionControllerTest} lives
 * in {@code com.myfinance.backend.controller} (same package as the class under test) and freely
 * wires up repositories and entities as fixtures, which is normal test setup, not a layering
 * violation.
 */
@AnalyzeClasses(packages = "com.myfinance.backend", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule layers = layeredArchitecture().consideringOnlyDependenciesInLayers()
            .layer("Controller").definedBy("..controller..")
            .layer("Service").definedBy("..service..")
            .layer("Repository").definedBy("..repository..")
            .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
            .whereLayer("Service").mayOnlyBeAccessedByLayers("Controller", "Service")
            .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service", "Repository");

    @ArchTest
    static final ArchRule controllersDoNotTouchRepositories = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().resideInAPackage("..repository..")
            .because("controllers go through services, which own the profile scoping");

    // Entities specifically, NOT the whole model package: controllers legitimately
    // take model enums as request parameters (TransactionType, SubscriptionStatus),
    // which is idiomatic Spring rather than a layering violation.
    @ArchTest
    static final ArchRule entitiesStayOutOfControllers = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().areAnnotatedWith(jakarta.persistence.Entity.class)
            .because("controllers speak DTOs; leaking entities leaks the schema onto the wire");
}

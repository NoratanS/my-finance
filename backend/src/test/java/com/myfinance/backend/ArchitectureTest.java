package com.myfinance.backend;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

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
    static final ArchRule layers = layeredArchitecture()
            .consideringOnlyDependenciesInLayers()
            .layer("Controller")
            .definedBy("..controller..")
            .layer("Service")
            .definedBy("..service..")
            .layer("Repository")
            .definedBy("..repository..")
            .whereLayer("Controller")
            .mayNotBeAccessedByAnyLayer()
            .whereLayer("Service")
            .mayOnlyBeAccessedByLayers("Controller", "Service")
            .whereLayer("Repository")
            .mayOnlyBeAccessedByLayers("Service", "Repository");

    @ArchTest
    static final ArchRule controllersDoNotTouchRepositories = noClasses()
            .that()
            .resideInAPackage("..controller..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..repository..")
            .because("controllers go through services, which own the profile scoping");

    // Entities specifically, NOT the whole model package: controllers legitimately
    // take model enums as request parameters (TransactionType, SubscriptionStatus),
    // which is idiomatic Spring rather than a layering violation.
    @ArchTest
    static final ArchRule entitiesStayOutOfControllers = noClasses()
            .that()
            .resideInAPackage("..controller..")
            .should()
            .dependOnClassesThat()
            .areAnnotatedWith(jakarta.persistence.Entity.class)
            .because("controllers speak DTOs; leaking entities leaks the schema onto the wire");

    // springdoc pulls jackson-databind 2.x (com.fasterxml.jackson.databind) onto the compile
    // classpath alongside the app's own mapper, Jackson 3 (tools.jackson.databind, wired in
    // JacksonConfig). A stray import of the 2.x databind package would build a mapper carrying
    // none of JacksonConfig's rules -- including the strict deserializer that rejects money sent
    // as a JSON number -- with nothing failing to say so. com.fasterxml.jackson.annotation.. is
    // exempt: it is Jackson 3's own shared annotations package and is used throughout app code.
    @ArchTest
    static final ArchRule noJackson2Databind = noClasses()
            .should()
            .dependOnClassesThat()
            .resideInAPackage("com.fasterxml.jackson.databind..")
            .because("the app's mapper is Jackson 3 (tools.jackson.databind, see JacksonConfig); "
                    + "com.fasterxml.jackson.databind 2.x is only on the classpath transitively via "
                    + "springdoc and carries none of JacksonConfig's rules, including the strict "
                    + "money deserializer");
}

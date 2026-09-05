package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import tools.jackson.databind.JsonNode;

/**
 * A saved analytics question (docs/SCHEMA.md "insight"): a name plus a versioned query plan the
 * analytics service executes. The plan stays an opaque JSON document here — the backend never
 * interprets it beyond "is this a JSON object" (docs/API.md "POST /api/insights/execute").
 */
@Entity
@Table(name = "insight")
public class Insight extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @Column(nullable = false)
    private String name;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private JsonNode plan;

    @JdbcTypeCode(SqlTypes.JSON)
    private JsonNode viz;

    @Column(nullable = false)
    private boolean pinned;

    protected Insight() {
        // JPA
    }

    public Insight(Profile profile, String name, JsonNode plan, JsonNode viz, boolean pinned) {
        this.profile = profile;
        update(name, plan, viz, pinned);
    }

    /** Full replacement of the editable fields (PUT semantics — docs/API.md "PUT /api/insights/{id}"). */
    public void update(String name, JsonNode plan, JsonNode viz, boolean pinned) {
        this.name = name;
        this.plan = plan;
        this.viz = viz;
        this.pinned = pinned;
    }

    public Profile getProfile() {
        return profile;
    }

    public String getName() {
        return name;
    }

    public JsonNode getPlan() {
        return plan;
    }

    public JsonNode getViz() {
        return viz;
    }

    public boolean isPinned() {
        return pinned;
    }
}

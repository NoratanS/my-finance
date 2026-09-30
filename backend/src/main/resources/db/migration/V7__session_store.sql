-- The session store (docs/SCHEMA.md "Session store"): Spring Session's JDBC repository keeps the
-- HTTP sessions in these two tables, so a backend restart signs no one out. Copied from Spring
-- Session 4.1.0's org/springframework/session/jdbc/schema-postgresql.sql (tabs turned into spaces);
-- the repository issues SQL against exactly these names and types, which is why they break this
-- schema's conventions. Spring Session's own initialiser is off
-- (spring.session.jdbc.initialize-schema=never): Flyway owns every table.
--
-- One deliberate deviation: PRINCIPAL_NAME is TEXT, not VARCHAR(100). It holds the sign-in email,
-- which POST /api/auth/register accepts up to 254 characters; with 100, a longer address could
-- register but never sign in. Re-apply it if a later Spring Session release changes its script.

CREATE TABLE SPRING_SESSION (
    PRIMARY_ID CHAR(36) NOT NULL,
    SESSION_ID CHAR(36) NOT NULL,
    CREATION_TIME BIGINT NOT NULL,
    LAST_ACCESS_TIME BIGINT NOT NULL,
    MAX_INACTIVE_INTERVAL INT NOT NULL,
    EXPIRY_TIME BIGINT NOT NULL,
    PRINCIPAL_NAME TEXT,
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID CHAR(36) NOT NULL,
    ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
    ATTRIBUTE_BYTES BYTEA NOT NULL,
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);

-- V4's ALTER DEFAULT PRIVILEGES has just granted the read-only analytics role SELECT on both
-- tables. A session id is a bearer credential (the cookie carries it base64-encoded, so reading
-- the column is enough to replay a session), and a serialized principal is not analytics data.
-- SessionStoreMigrationTest fails if any spring_session* table becomes readable to the role.
REVOKE ALL ON TABLE SPRING_SESSION, SPRING_SESSION_ATTRIBUTES FROM myfinance_ro;

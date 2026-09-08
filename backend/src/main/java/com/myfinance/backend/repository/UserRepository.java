package com.myfinance.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.myfinance.backend.model.User;

public interface UserRepository extends JpaRepository<User, Long> {

    /** Emails are stored lowercased by the service layer, so this is a plain equality lookup. */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}

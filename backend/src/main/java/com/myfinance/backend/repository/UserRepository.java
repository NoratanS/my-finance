package com.myfinance.backend.repository;

import com.myfinance.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    /** Emails are stored lowercased by the service layer, so this is a plain equality lookup. */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}

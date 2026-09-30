package com.myfinance.backend.controller;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.myfinance.backend.dto.ActiveProfileRequest;
import com.myfinance.backend.dto.ActiveProfileResponse;
import com.myfinance.backend.dto.LoginRequest;
import com.myfinance.backend.dto.RegisterRequest;
import com.myfinance.backend.dto.SessionResponse;
import com.myfinance.backend.dto.SetPasswordRequest;
import com.myfinance.backend.dto.UserResponse;
import com.myfinance.backend.service.AuthService;

/**
 * docs/API.md "Auth". Note there is no logout method here: {@code POST /api/auth/logout} is
 * handled by Spring Security's {@code LogoutFilter}, configured in {@code SecurityConfig}
 * (invalidates the session, deletes the cookie, returns 204).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public SessionResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public SessionResponse me() {
        return authService.currentSession();
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setPassword(@Valid @RequestBody SetPasswordRequest request) {
        authService.setPassword(request);
    }

    @PutMapping("/active-profile")
    public ActiveProfileResponse switchProfile(@Valid @RequestBody ActiveProfileRequest request) {
        return authService.switchProfile(request.profileId());
    }
}

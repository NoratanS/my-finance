package com.myfinance.backend.service;

import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.config.AuthProperties;
import com.myfinance.backend.dto.ActiveProfileResponse;
import com.myfinance.backend.dto.ProfileSummary;
import com.myfinance.backend.dto.RegisterRequest;
import com.myfinance.backend.dto.SessionResponse;
import com.myfinance.backend.dto.SetPasswordRequest;
import com.myfinance.backend.dto.UserResponse;
import com.myfinance.backend.exception.AuthDisabledException;
import com.myfinance.backend.exception.EmailTakenException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.ActiveProfile;
import com.myfinance.backend.security.CurrentUser;

/**
 * Accounts and sessions: register, describe the current session, switch the active profile.
 * (Binding a login to the HTTP session is {@code SessionAuthenticator}'s job — no servlet types
 * here.) The active profile — reading it, verifying it and switching it — is {@link ActiveProfile}'s
 * (docs/API.md "Active profile: server-side, never client-supplied").
 */
@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;
    private final CurrentUser currentUser;
    private final ActiveProfile activeProfile;
    private final AuthProperties authProperties;

    public AuthService(
            UserRepository userRepository,
            ProfileRepository profileRepository,
            PasswordEncoder passwordEncoder,
            CurrentUser currentUser,
            ActiveProfile activeProfile,
            AuthProperties authProperties) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.passwordEncoder = passwordEncoder;
        this.currentUser = currentUser;
        this.activeProfile = activeProfile;
        this.authProperties = authProperties;
    }

    /** Creates the account. Does not log in and does not create a profile. */
    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (authProperties.passwordless()) {
            throw new AuthDisabledException();
        }
        String email = User.normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new EmailTakenException(email);
        }
        User user = new User(email, passwordEncoder.encode(request.password()), request.displayName());
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Sets, or overwrites, the authenticated user's password. Only reachable on a passwordless
     * instance ({@code AuthController} guards the mode), where it lets the local account get a
     * password before the instance is switched back to password authentication. The account is
     * always the principal's — never an id from the request. No {@code save()} call: the
     * loaded entity is managed, so the changed hash is flushed on commit (dirty checking).
     */
    @Transactional
    public void setPassword(SetPasswordRequest request) {
        User user = userRepository.findById(currentUser.id()).orElseThrow();
        user.changePasswordHash(passwordEncoder.encode(request.password()));
    }

    public SessionResponse currentSession() {
        return session(userRepository.findById(currentUser.id()).orElseThrow());
    }

    /** Switches to one of the user's own profiles; 404 for any other id (see {@link ActiveProfile#switchTo}). */
    public ActiveProfileResponse switchProfile(Long profileId) {
        Profile profile = activeProfile.switchTo(profileId);
        return new ActiveProfileResponse(profile.getId(), ProfileSummary.from(profile));
    }

    private SessionResponse session(User user) {
        List<ProfileSummary> profiles = profileRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()).stream()
                .map(ProfileSummary::from)
                .toList();
        // A dangling active profile (deleted from another session) reads as none: see ActiveProfile.
        Long activeId = activeProfile.find().map(Profile::getId).orElse(null);

        return new SessionResponse(
                new SessionResponse.SessionUser(user.getId(), user.getEmail(), user.getDisplayName()),
                profiles,
                activeId,
                authProperties.mode());
    }
}

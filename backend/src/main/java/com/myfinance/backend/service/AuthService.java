package com.myfinance.backend.service;

import com.myfinance.backend.dto.ActiveProfileResponse;
import com.myfinance.backend.dto.ProfileSummary;
import com.myfinance.backend.dto.RegisterRequest;
import com.myfinance.backend.dto.SessionResponse;
import com.myfinance.backend.dto.UserResponse;
import com.myfinance.backend.exception.EmailTakenException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.ActiveProfile;
import com.myfinance.backend.security.CurrentUser;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Accounts and sessions: register, describe the current session, switch the active profile.
 * (Binding a login to the HTTP session is {@code SessionAuthenticator}'s job — no servlet types
 * here.) The active profile lives in the HTTP session (docs/API.md "Active profile: server-side,
 * never client-supplied") and only {@link #switchProfile} writes it, after verifying ownership.
 */
@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;
    private final CurrentUser currentUser;
    private final ActiveProfile activeProfile;

    public AuthService(UserRepository userRepository, ProfileRepository profileRepository,
                       PasswordEncoder passwordEncoder, CurrentUser currentUser, ActiveProfile activeProfile) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.passwordEncoder = passwordEncoder;
        this.currentUser = currentUser;
        this.activeProfile = activeProfile;
    }

    /** Creates the account. Does not log in and does not create a profile. */
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = User.normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new EmailTakenException(email);
        }
        User user = new User(email, passwordEncoder.encode(request.password()), request.displayName());
        return UserResponse.from(userRepository.save(user));
    }

    public SessionResponse currentSession() {
        return session(userRepository.findById(currentUser.id()).orElseThrow());
    }

    /**
     * The hinge of the scoping model: the only place a client-supplied profile id is accepted,
     * and it is only written to the session once it is proven to belong to the current user.
     * A profile owned by someone else is indistinguishable from a missing one (404).
     */
    public ActiveProfileResponse switchProfile(Long profileId) {
        Profile profile = profileRepository.findByIdAndUserId(profileId, currentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("profile", profileId));
        activeProfile.set(profile.getId());
        return new ActiveProfileResponse(profile.getId(), ProfileSummary.from(profile));
    }

    private SessionResponse session(User user) {
        List<ProfileSummary> profiles = profileRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()).stream()
                .map(ProfileSummary::from)
                .toList();
        return new SessionResponse(
                new SessionResponse.SessionUser(user.getId(), user.getEmail(), user.getDisplayName()),
                profiles,
                activeProfile.id().orElse(null));
    }
}

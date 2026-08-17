package com.myfinance.backend.service;

import com.myfinance.backend.dto.ActiveProfileResponse;
import com.myfinance.backend.dto.LoginRequest;
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
import com.myfinance.backend.security.AppUserDetails;
import com.myfinance.backend.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Accounts and sessions: register, log in, describe the current session, switch the
 * active profile. The active profile lives in the HTTP session (docs/API.md "Active
 * profile: server-side, never client-supplied") and only {@link #switchProfile} writes it,
 * after verifying ownership.
 */
@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final CurrentUser currentUser;
    private final ActiveProfile activeProfile;

    public AuthService(UserRepository userRepository, ProfileRepository profileRepository,
                       PasswordEncoder passwordEncoder, AuthenticationManager authenticationManager,
                       SecurityContextRepository securityContextRepository, CurrentUser currentUser,
                       ActiveProfile activeProfile) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
        this.currentUser = currentUser;
        this.activeProfile = activeProfile;
    }

    /** Creates the account. Does not log in and does not create a profile. */
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = request.email().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new EmailTakenException(email);
        }
        User user = new User(email, passwordEncoder.encode(request.password()), request.displayName());
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Authenticates the credentials and stores the result in the HTTP session, which is
     * what the session cookie then refers to on later requests. A {@code BadCredentialsException}
     * propagates to the {@code GlobalExceptionHandler} (401).
     */
    public SessionResponse login(LoginRequest request, HttpServletRequest httpRequest,
                                 HttpServletResponse httpResponse) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email().toLowerCase(), request.password()));

        // Session fixation: never keep the id of a session that existed before login.
        if (httpRequest.getSession(false) != null) {
            httpRequest.changeSessionId();
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        // A fresh login never inherits a profile chosen by an earlier session.
        activeProfile.clear();

        AppUserDetails details = (AppUserDetails) authentication.getPrincipal();
        return session(userRepository.findById(details.getId()).orElseThrow());
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

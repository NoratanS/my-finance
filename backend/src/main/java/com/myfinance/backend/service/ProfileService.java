package com.myfinance.backend.service;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.dto.CreateProfileRequest;
import com.myfinance.backend.dto.ProfileResponse;
import com.myfinance.backend.dto.UpdateProfileRequest;
import com.myfinance.backend.exception.LastProfileException;
import com.myfinance.backend.exception.ProfileNameTakenException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.ActiveProfile;
import com.myfinance.backend.security.CurrentUser;

/** Profiles sit above the profile boundary: scoped by the authenticated user, not by the active profile. */
@Service
@Transactional(readOnly = true)
public class ProfileService {

    private final ProfileRepository profileRepository;
    private final UserRepository userRepository;
    private final CurrentUser currentUser;
    private final ActiveProfile activeProfile;

    public ProfileService(
            ProfileRepository profileRepository,
            UserRepository userRepository,
            CurrentUser currentUser,
            ActiveProfile activeProfile) {
        this.profileRepository = profileRepository;
        this.userRepository = userRepository;
        this.currentUser = currentUser;
        this.activeProfile = activeProfile;
    }

    public List<ProfileResponse> list() {
        return profileRepository.findAllByUserIdOrderByCreatedAtAsc(currentUser.id()).stream()
                .map(ProfileResponse::from)
                .toList();
    }

    /** Also closes the {@code Location} header from {@link #create}: it now resolves. */
    public ProfileResponse get(Long id) {
        return ProfileResponse.from(requireOwnProfile(id));
    }

    /** Creates a profile for the current user. Does not make it the active profile. */
    @Transactional
    public ProfileResponse create(CreateProfileRequest request) {
        Long userId = currentUser.id();
        // Check-then-insert gives a clean 409; UNIQUE (user_id, name) in the DB is the backstop for races.
        if (profileRepository.existsByUserIdAndName(userId, request.name())) {
            throw new ProfileNameTakenException(request.name());
        }
        User owner = userRepository.getReferenceById(userId);
        Profile profile = profileRepository.save(new Profile(owner, request.name(), request.defaultCurrency()));
        return ProfileResponse.from(profile);
    }

    @Transactional
    public ProfileResponse rename(Long id, UpdateProfileRequest request) {
        Profile profile = requireOwnProfile(id);
        if (!Objects.equals(profile.getName(), request.name())
                && profileRepository.existsByUserIdAndName(currentUser.id(), request.name())) {
            throw new ProfileNameTakenException(request.name());
        }
        profile.rename(request.name());
        return ProfileResponse.from(profile);
    }

    /**
     * Deletes a profile and everything it owns — categories, transactions, budgets,
     * subscriptions, insights — via {@code ON DELETE CASCADE} (docs/SCHEMA.md
     * "Foreign keys and cascade behavior"). Refuses to delete a user's only profile so
     * the session is never left without one to fall back on; clears the active-profile
     * session attribute if the deleted profile was the active one.
     */
    @Transactional
    public void delete(Long id) {
        Long userId = currentUser.id();
        // Locks every one of the user's profile rows for the rest of this transaction (see
        // ProfileRepository#lockAllByUserId), so the "not the last profile" check and the
        // delete are atomic with respect to a concurrent delete of a DIFFERENT profile owned
        // by the same user — without this, two deletes racing at count 2 could both pass the
        // check and leave zero.
        List<Profile> ownedProfiles = profileRepository.lockAllByUserId(userId);
        Profile profile = ownedProfiles.stream()
                .filter(p -> p.getId().equals(id))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("profile", id));
        if (ownedProfiles.size() <= 1) {
            throw new LastProfileException();
        }
        profileRepository.delete(profile);
        if (activeProfile.id().map(id::equals).orElse(false)) {
            activeProfile.clear();
        }
    }

    private Profile requireOwnProfile(Long id) {
        return profileRepository
                .findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("profile", id));
    }
}

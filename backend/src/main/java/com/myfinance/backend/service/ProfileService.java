package com.myfinance.backend.service;

import com.myfinance.backend.dto.CreateProfileRequest;
import com.myfinance.backend.dto.ProfileResponse;
import com.myfinance.backend.exception.ProfileNameTakenException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Profiles sit above the profile boundary: scoped by the authenticated user, not by the active profile. */
@Service
@Transactional(readOnly = true)
public class ProfileService {

    private final ProfileRepository profileRepository;
    private final UserRepository userRepository;
    private final CurrentUser currentUser;

    public ProfileService(ProfileRepository profileRepository, UserRepository userRepository, CurrentUser currentUser) {
        this.profileRepository = profileRepository;
        this.userRepository = userRepository;
        this.currentUser = currentUser;
    }

    public List<ProfileResponse> list() {
        return profileRepository.findAllByUserIdOrderByCreatedAtAsc(currentUser.id()).stream()
                .map(ProfileResponse::from)
                .toList();
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
}

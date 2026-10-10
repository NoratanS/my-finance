package com.myfinance.backend.service;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.dto.CreateProfileRequest;
import com.myfinance.backend.dto.ProfileResponse;
import com.myfinance.backend.dto.UpdateProfileRequest;
import com.myfinance.backend.exception.ProfileNameTakenException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.ProfileRepository;

/** Profiles sit above the profile boundary: these operations never read the active profile. */
@Service
@Transactional(readOnly = true)
public class ProfileService {

    private final ProfileRepository profileRepository;

    public ProfileService(ProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    public List<ProfileResponse> list() {
        return profileRepository.findAllByOrderByCreatedAtAsc().stream()
                .map(ProfileResponse::from)
                .toList();
    }

    /** Also closes the {@code Location} header from {@link #create}: it now resolves. */
    public ProfileResponse get(Long id) {
        return ProfileResponse.from(requireProfile(id));
    }

    /** Creates a profile. Does not make it the active profile: the browser chooses that. */
    @Transactional
    public ProfileResponse create(CreateProfileRequest request) {
        // Check-then-insert gives a clean 409; UNIQUE (name) in the DB is the backstop for races.
        if (profileRepository.existsByName(request.name())) {
            throw new ProfileNameTakenException(request.name());
        }
        Profile profile = profileRepository.save(new Profile(request.name(), request.defaultCurrency()));
        return ProfileResponse.from(profile);
    }

    @Transactional
    public ProfileResponse rename(Long id, UpdateProfileRequest request) {
        Profile profile = requireProfile(id);
        if (!Objects.equals(profile.getName(), request.name()) && profileRepository.existsByName(request.name())) {
            throw new ProfileNameTakenException(request.name());
        }
        profile.rename(request.name());
        return ProfileResponse.from(profile);
    }

    /**
     * Deletes a profile and everything it owns — categories, transactions, budgets,
     * subscriptions, insights — via {@code ON DELETE CASCADE} (docs/SCHEMA.md
     * "Foreign keys and cascade behavior"). The only profile can be deleted too: an instance
     * with no profiles is the first-run state. A browser that still names the deleted profile
     * reads as having no active profile from its next request on ({@code ActiveProfile}).
     */
    @Transactional
    public void delete(Long id) {
        profileRepository.delete(requireProfile(id));
    }

    private Profile requireProfile(Long id) {
        return profileRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("profile", id));
    }
}

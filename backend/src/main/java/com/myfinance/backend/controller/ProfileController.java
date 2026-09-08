package com.myfinance.backend.controller;

import com.myfinance.backend.dto.CreateProfileRequest;
import com.myfinance.backend.dto.ProfileResponse;
import com.myfinance.backend.dto.UpdateProfileRequest;
import com.myfinance.backend.service.ProfileService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/** docs/API.md "Profiles". */
@RestController
@RequestMapping("/api/profiles")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public List<ProfileResponse> list() {
        return profileService.list();
    }

    @GetMapping("/{id}")
    public ProfileResponse get(@PathVariable Long id) {
        return profileService.get(id);
    }

    @PostMapping
    public ResponseEntity<ProfileResponse> create(@Valid @RequestBody CreateProfileRequest request) {
        ProfileResponse created = profileService.create(request);
        return ResponseEntity.created(URI.create("/api/profiles/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public ProfileResponse rename(@PathVariable Long id, @Valid @RequestBody UpdateProfileRequest request) {
        return profileService.rename(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        profileService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

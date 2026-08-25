package com.myfinance.backend.controller;

import com.myfinance.backend.dto.BackupExportRequest;
import com.myfinance.backend.dto.BackupFile;
import com.myfinance.backend.dto.BackupRestoreResponse;
import com.myfinance.backend.service.BackupService;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Manual backup (docs/API.md "Backup"). Both endpoints sit above the profile boundary — they
 * require authentication but no active profile, like {@code GET /api/profiles}.
 */
@RestController
@RequestMapping("/api/backup")
public class BackupController {

    private final BackupService backupService;

    public BackupController(BackupService backupService) {
        this.backupService = backupService;
    }

    /** POST, not GET: the response is a generated document parameterized by a validated body. */
    @PostMapping("/export")
    public ResponseEntity<BackupFile> export(@Valid @RequestBody BackupExportRequest request) {
        BackupFile file = backupService.export(request.profileIds());
        // Filename date comes from the file's own exportedAt (the Clock bean), so the two agree.
        String filename = "my-finance-backup-" + LocalDate.ofInstant(file.exportedAt(), ZoneOffset.UTC) + ".json";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .body(file);
    }

    @PostMapping("/restore")
    public BackupRestoreResponse restore(@RequestPart("file") MultipartFile file) {
        return backupService.restore(file);
    }
}

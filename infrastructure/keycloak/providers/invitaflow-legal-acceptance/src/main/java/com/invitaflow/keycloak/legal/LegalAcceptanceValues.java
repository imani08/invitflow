package com.invitaflow.keycloak.legal;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

final class LegalAcceptanceValues {
    static final String TERMS_VERSION = "1.0";
    static final String PRIVACY_VERSION = "1.0";

    private LegalAcceptanceValues() { }

    static boolean isAccepted(String value) {
        return "accepted".equals(value);
    }

    static Map<String, List<String>> attributes(Clock clock) {
        String acceptedAt = Instant.now(clock).toString();
        return Map.of(
            "invitaflow_terms_version", List.of(TERMS_VERSION),
            "invitaflow_privacy_version", List.of(PRIVACY_VERSION),
            "invitaflow_terms_accepted_at", List.of(acceptedAt),
            "invitaflow_privacy_accepted_at", List.of(acceptedAt)
        );
    }
}

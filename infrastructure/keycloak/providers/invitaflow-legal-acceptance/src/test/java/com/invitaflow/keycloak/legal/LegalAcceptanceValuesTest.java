package com.invitaflow.keycloak.legal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import jakarta.ws.rs.core.MultivaluedHashMap;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.http.HttpRequest;
import org.keycloak.models.UserModel;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

class LegalAcceptanceValuesTest {
    private final LegalAcceptanceFormAction action = new LegalAcceptanceFormAction();

    @Test
    void rejectsRegistrationWhenCheckboxIsAbsent() {
        var context = validationContext(new MultivaluedHashMap<>());
        action.validate(context);

        verify(context).validationError(any(), any());
        verify(context, never()).success();
    }

    @Test
    void acceptsRegistrationWhenCheckboxIsSubmitted() {
        var formData = new MultivaluedHashMap<String, String>();
        formData.putSingle(LegalAcceptanceFormAction.CHECKBOX_NAME, "accepted");
        var context = validationContext(formData);
        action.validate(context);

        verify(context).success();
        verify(context, never()).validationError(any(), any());
    }

    @Test
    void writesVersionedAcceptanceAndServerTimestampToUser() {
        UserModel user = mock(UserModel.class);
        FormContext context = mock(FormContext.class);
        when(context.getUser()).thenReturn(user);

        var captured = new java.util.HashMap<String, List<String>>();
        doAnswer(invocation -> {
            captured.put(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(user).setAttribute(anyString(), anyList());
        action.success(context);

        org.mockito.Mockito.verify(user).setAttribute(eq("invitaflow_terms_version"), eq(List.of("1.0")));
        org.mockito.Mockito.verify(user).setAttribute(eq("invitaflow_privacy_version"), eq(List.of("1.0")));
        Instant termsAt = Instant.parse(captured.get("invitaflow_terms_accepted_at").getFirst());
        Instant privacyAt = Instant.parse(captured.get("invitaflow_privacy_accepted_at").getFirst());
        assertEquals(termsAt, privacyAt);
        assertFalse(termsAt.isAfter(Instant.now()));
    }

    @Test
    void storesBothVersionsAndServerGeneratedUtcTimestamps() {
        Instant expected = Instant.parse("2026-10-07T10:15:30Z");
        var attributes = LegalAcceptanceValues.attributes(Clock.fixed(expected, ZoneOffset.UTC));

        assertEquals("1.0", attributes.get("invitaflow_terms_version").getFirst());
        assertEquals("1.0", attributes.get("invitaflow_privacy_version").getFirst());
        assertEquals(expected.toString(), attributes.get("invitaflow_terms_accepted_at").getFirst());
        assertEquals(expected.toString(), attributes.get("invitaflow_privacy_accepted_at").getFirst());
    }

    private static ValidationContext validationContext(MultivaluedHashMap<String, String> formData) {
        HttpRequest request = mock(HttpRequest.class);
        when(request.getDecodedFormParameters()).thenReturn(formData);
        ValidationContext context = mock(ValidationContext.class);
        when(context.getHttpRequest()).thenReturn(request);
        return context;
    }
}

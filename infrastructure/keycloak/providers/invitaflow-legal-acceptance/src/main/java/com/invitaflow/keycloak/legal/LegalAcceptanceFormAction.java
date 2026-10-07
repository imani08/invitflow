package com.invitaflow.keycloak.legal;

import java.net.URI;
import java.time.Clock;
import java.util.List;
import java.util.Map;

import org.keycloak.authentication.FormAction;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;

public final class LegalAcceptanceFormAction implements FormAction {
    public static final String CHECKBOX_NAME = "invitaflow_legal_acceptance";
    private static final String ERROR_KEY = "invitaflowLegalAcceptanceRequired";
    private static final String PUBLIC_WEB_URL_ENV = "PUBLIC_WEB_URL";
    private static final String DEFAULT_PUBLIC_WEB_URL = "http://localhost:3000";

    @Override
    public void buildPage(FormContext context, LoginFormsProvider form) {
        form.setAttribute("invitaflowPublicWebUrl", publicWebUrl());
    }

    @Override
    public void validate(ValidationContext context) {
        var formData = context.getHttpRequest().getDecodedFormParameters();
        if (!LegalAcceptanceValues.isAccepted(formData.getFirst(CHECKBOX_NAME))) {
            context.validationError(formData, List.of(new FormMessage(CHECKBOX_NAME, ERROR_KEY)));
            return;
        }
        context.success();
    }

    @Override
    public void success(FormContext context) {
        UserModel user = context.getUser();
        if (user == null) {
            throw new IllegalStateException("Registration user must exist before legal acceptance is persisted");
        }
        LegalAcceptanceValues.attributes(Clock.systemUTC()).forEach(user::setAttribute);
    }

    @Override public boolean requiresUser() { return false; }
    @Override public boolean configuredFor(org.keycloak.models.KeycloakSession session, org.keycloak.models.RealmModel realm, UserModel user) { return true; }
    @Override public void setRequiredActions(org.keycloak.models.KeycloakSession session, org.keycloak.models.RealmModel realm, UserModel user) { }
    @Override public void close() { }

    private static String publicWebUrl() {
        String configured = System.getenv(PUBLIC_WEB_URL_ENV);
        String base = configured == null || configured.isBlank() ? DEFAULT_PUBLIC_WEB_URL : configured.trim();
        URI uri = URI.create(base);
        if (uri.getHost() == null || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
            throw new IllegalStateException("PUBLIC_WEB_URL must be an absolute HTTP(S) URL");
        }
        return base.replaceAll("/+$", "");
    }
}

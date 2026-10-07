package com.invitaflow.keycloak.legal;

import java.util.List;

import org.keycloak.Config;
import org.keycloak.authentication.FormAction;
import org.keycloak.authentication.FormActionFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

public final class LegalAcceptanceFormActionFactory implements FormActionFactory {
    public static final String PROVIDER_ID = "invitaflow-legal-acceptance";

    @Override public FormAction create(KeycloakSession session) { return new LegalAcceptanceFormAction(); }
    @Override public String getId() { return PROVIDER_ID; }
    @Override public String getDisplayType() { return "InvitaFlow legal acceptance"; }
    @Override public String getHelpText() { return "Requires acceptance of the versioned InvitaFlow Terms and Privacy Policy."; }
    @Override public String getReferenceCategory() { return null; }
    @Override public AuthenticationExecutionModel.Requirement[] getRequirementChoices() { return new AuthenticationExecutionModel.Requirement[] { AuthenticationExecutionModel.Requirement.REQUIRED }; }
    @Override public boolean isConfigurable() { return false; }
    @Override public boolean isUserSetupAllowed() { return false; }
    @Override public List<ProviderConfigProperty> getConfigProperties() { return List.of(); }
    @Override public void init(Config.Scope config) { }
    @Override public void postInit(KeycloakSessionFactory factory) { }
    @Override public void close() { }
}

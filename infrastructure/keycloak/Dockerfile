FROM maven:3.9.9-eclipse-temurin-21 AS legal-provider-build
WORKDIR /provider
COPY infrastructure/keycloak/providers/invitaflow-legal-acceptance/pom.xml ./pom.xml
COPY infrastructure/keycloak/providers/invitaflow-legal-acceptance/src ./src
RUN mvn --batch-mode --no-transfer-progress package

FROM quay.io/keycloak/keycloak:26.7.4 AS keycloak-build
ENV KC_DB=postgres
COPY --from=legal-provider-build /provider/target/invitaflow-legal-acceptance-1.0.0.jar /opt/keycloak/providers/invitaflow-legal-acceptance.jar
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.7.4
COPY --from=keycloak-build /opt/keycloak/ /opt/keycloak/

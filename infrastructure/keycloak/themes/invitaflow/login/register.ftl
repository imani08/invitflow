<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "user-profile-commons.ftl" as userProfileCommons>
<#import "register-commons.ftl" as registerCommons>
<#import "password-validation.ftl" as validator>
<@layout.registrationLayout displayMessage=messagesPerField.exists('global') displayRequiredFields=true; section>
    <#if section = "header">
        <#if messageHeader??>${msg(messageHeader)}<#else>${msg("registerTitle")}</#if>
    <#elseif section = "form">
        <form id="kc-register-form" class="${properties.kcFormClass!}" action="${url.registrationAction}" method="post" novalidate="novalidate">
            <@userProfileCommons.userProfileFormFields; callback, attribute>
                <#if callback = "afterField">
                    <#if passwordRequired?? && (attribute.name == 'username' || (attribute.name == 'email' && realm.registrationEmailAsUsername))>
                        <@field.password name="password" required=true label=msg("password") autocomplete="new-password" />
                        <@field.password name="password-confirm" required=true label=msg("passwordConfirm") autocomplete="new-password" />
                    </#if>
                </#if>
            </@userProfileCommons.userProfileFormFields>
            <@registerCommons.termsAcceptance/>

            <div class="if-legal-acceptance<#if messagesPerField.existsError('invitaflow_legal_acceptance')> if-legal-acceptance-error</#if>">
                <input id="invitaflow_legal_acceptance" name="invitaflow_legal_acceptance" type="checkbox" value="accepted" aria-describedby="invitaflow-legal-error" <#if messagesPerField.existsError('invitaflow_legal_acceptance')>aria-invalid="true"</#if>>
                <label for="invitaflow_legal_acceptance">${msg("invitaflowLegalPrefix")} <a href="${invitaflowPublicWebUrl}/legal/cgu" target="_blank" rel="noopener noreferrer">${msg("invitaflowLegalTerms")}</a> ${msg("invitaflowLegalAnd")} <a href="${invitaflowPublicWebUrl}/legal/confidentialite" target="_blank" rel="noopener noreferrer">${msg("invitaflowLegalPrivacy")}</a>.</label>
                <#if messagesPerField.existsError('invitaflow_legal_acceptance')>
                    <span class="if-legal-error" id="invitaflow-legal-error" role="alert">${kcSanitize(messagesPerField.get('invitaflow_legal_acceptance'))?no_esc}</span>
                </#if>
            </div>

            <#if recaptchaRequired?? && (recaptchaVisible!false)>
                <div class="form-group"><div class="${properties.kcInputWrapperClass!}"><div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}" data-action="${recaptchaAction}"></div></div></div>
            </#if>
            <#if recaptchaRequired?? && !(recaptchaVisible!false)>
                <script>function onSubmitRecaptcha(token) { document.getElementById("kc-register-form").requestSubmit(); }</script>
                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <button class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} g-recaptcha" data-sitekey="${recaptchaSiteKey}" data-callback="onSubmitRecaptcha" data-action="${recaptchaAction}" type="submit" id="kc-submit">${msg("doRegister")}</button>
                </div>
            <#else>
                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}"><input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("doRegister")}"/></div>
            </#if>
            <div class="${properties.kcFormGroupClass!} pf-v5-c-login__main-footer-band"><div id="kc-form-options" class="${properties.kcFormOptionsClass!} pf-v5-c-login__main-footer-band-item"><div class="${properties.kcFormOptionsWrapperClass!}"><span><a href="${url.loginUrl}">${msg("backToLogin")}</a></span></div></div></div>
        </form>
        <@validator.templates/>
        <@validator.script field="password"/>
    </#if>
</@layout.registrationLayout>

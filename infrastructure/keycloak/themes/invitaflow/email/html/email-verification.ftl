<#import "template.ftl" as layout>
<@layout.emailLayout>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf7f1;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#30233c">
  <tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e8dfd2;border-radius:18px;overflow:hidden">
    <tr><td style="padding:30px 32px 12px;text-align:center"><div style="font-size:26px;font-weight:700;color:#42234f">InvitaFlow</div><div style="margin-top:6px;color:#776984;font-size:13px">${msg("emailFooterOperator")}</div></td></tr>
    <tr><td style="padding:12px 32px 28px;font-size:15px;line-height:1.65">${kcSanitize(msg("emailVerificationBodyHtml"))?no_esc}
      <p style="text-align:center;margin:26px 0"><a href="${kcSanitize(link)?no_esc}" style="display:inline-block;background:#42234f;color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">${msg("emailVerificationLinkText")}</a></p>
      ${kcSanitize(msg("emailVerificationBodyCodeHtml", link))?no_esc}
      <p style="color:#665d69;font-size:13px">${msg("emailVerificationFooter", linkExpirationFormatter(linkExpiration))}</p>
      <p style="color:#665d69;font-size:13px">${msg("emailFooterContact")}</p>
    </td></tr><tr><td style="background:#f5efe6;padding:16px 32px;text-align:center;color:#776984;font-size:12px">${msg("emailFooterBrand")} · ${msg("emailFooterOperator")}</td></tr>
  </table></td></tr>
</table>
</@layout.emailLayout>

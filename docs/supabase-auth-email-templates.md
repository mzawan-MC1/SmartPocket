# Smart Pocket Supabase Auth Email Templates

Use this file as the copy-ready handoff for Supabase Dashboard.

- Supabase Dashboard path: `Authentication -> Email Templates`
- Brand name: `Smart Pocket`
- Production domain: `https://1smartpocket.com`
- Sender: `Smart Pocket <no-reply@1smartpocket.com>`
- Support / reply-to: `info@1smartpocket.com`
- Default logo URL: `https://1smartpocket.com/assets/images/app_logo.png`

If the admin-configured email logo changes in `/admin/email`, replace the logo URL in the template HTML before pasting it into Supabase Dashboard.

## Template Groups

- Authentication templates: 1. Confirm signup, 2. Password reset, 3. Magic link / OTP, 4. Invite user, 5. Change email, 6. Reauthentication
- Security-notification templates: 7. Password changed, 8. Email changed, 9. Sign-in method linked, 10. Sign-in method removed

## Template 1: Confirm Signup

- Subject: `Confirm your Smart Pocket account`
- Supported variables used: `{{ .ConfirmationURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Confirm your account</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Welcome to Smart Pocket. Confirm your email address to activate your account and continue securely.</p><p style="margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00b4d8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Confirm email</a></p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">If the button does not work, open this link:<br /><a href="{{ .ConfirmationURL }}" style="color:#0f3460;word-break:break-all;">{{ .ConfirmationURL }}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you did not create this account, you can safely ignore this email. Contact <a href="mailto:info@1smartpocket.com" style="color:#0f3460;">info@1smartpocket.com</a> if you need help.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 2: Password Reset

- Subject: `Reset your Smart Pocket password`
- Supported variables used: `{{ .ConfirmationURL }}`, `{{ .Email }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Reset your password</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We received a request to reset the password for {{ .Email }}.</p><p style="margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00b4d8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Reset password</a></p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">If the button does not work, open this link:<br /><a href="{{ .ConfirmationURL }}" style="color:#0f3460;word-break:break-all;">{{ .ConfirmationURL }}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you did not request this change, ignore this email and your password will remain unchanged.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 3: Magic Link / OTP

- Subject: `Your Smart Pocket sign-in link and code`
- Supported variables used: `{{ .ConfirmationURL }}`, `{{ .Token }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Sign in securely</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Use the secure sign-in link below, or enter the one-time code in Smart Pocket if prompted.</p><p style="margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00b4d8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Open sign-in link</a></p><p style="margin:0 0 12px;font-size:15px;line-height:1.7;"><strong>One-time code:</strong> {{ .Token }}</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">Fallback link: <a href="{{ .ConfirmationURL }}" style="color:#0f3460;word-break:break-all;">{{ .ConfirmationURL }}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you did not request this sign-in, ignore this message.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 4: Invite User

- Subject: `You have been invited to Smart Pocket`
- Supported variables used: `{{ .ConfirmationURL }}`, `{{ .Email }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">You are invited</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">An administrator invited {{ .Email }} to join Smart Pocket. Accept the invitation to continue.</p><p style="margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00b4d8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Accept invitation</a></p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">Fallback link: <a href="{{ .ConfirmationURL }}" style="color:#0f3460;word-break:break-all;">{{ .ConfirmationURL }}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you were not expecting this invite, you can ignore this email.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 5: Change Email

- Subject: `Confirm your new Smart Pocket email address`
- Supported variables used: `{{ .ConfirmationURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Confirm your new email</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Finish updating your Smart Pocket login email by confirming this address.</p><p style="margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00b4d8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Confirm new email</a></p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">Fallback link: <a href="{{ .ConfirmationURL }}" style="color:#0f3460;word-break:break-all;">{{ .ConfirmationURL }}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you did not request this change, contact <a href="mailto:info@1smartpocket.com" style="color:#0f3460;">info@1smartpocket.com</a>.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 6: Reauthentication

- Subject: `Confirm your Smart Pocket security check`
- Supported variables used: `{{ .ConfirmationURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Security confirmation required</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">For your protection, Smart Pocket requires a fresh confirmation before this sensitive action can continue.</p><p style="margin:0 0 24px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00b4d8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Continue securely</a></p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">Fallback link: <a href="{{ .ConfirmationURL }}" style="color:#0f3460;word-break:break-all;">{{ .ConfirmationURL }}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If this was not you, ignore this email and secure your account immediately.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 7: Password Changed

- Subject: `Your Smart Pocket password was changed`
- Supported variables used: `{{ .Email }}`, `{{ .SiteURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Password updated</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">This is a confirmation that the password for {{ .Email }} was changed successfully.</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">If you made this change, no further action is required.</p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you did not change your password, go to <a href="{{ .SiteURL }}" style="color:#0f3460;">{{ .SiteURL }}</a> and secure your account immediately.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 8: Email Changed

- Subject: `Your Smart Pocket email address was updated`
- Supported variables used: `{{ .SiteURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Email updated</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Your Smart Pocket sign-in email has been updated successfully.</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">If this change was expected, you do not need to do anything else.</p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you did not make this change, go to <a href="{{ .SiteURL }}" style="color:#0f3460;">{{ .SiteURL }}</a> and contact <a href="mailto:info@1smartpocket.com" style="color:#0f3460;">info@1smartpocket.com</a>.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 9: Sign-In Method Linked

- Subject: `A new sign-in method was linked to Smart Pocket`
- Supported variables used: `{{ .SiteURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Sign-in method linked</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">A new sign-in method was linked to your Smart Pocket account.</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">If you approved this change, no action is needed.</p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If you do not recognize this change, review your account immediately at <a href="{{ .SiteURL }}" style="color:#0f3460;">{{ .SiteURL }}</a>.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Template 10: Sign-In Method Removed

- Subject: `A sign-in method was removed from Smart Pocket`
- Supported variables used: `{{ .SiteURL }}`

```html
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f7fb;color:#102033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ef;border-radius:20px;overflow:hidden;">
      <tr><td style="background:#0f3460;padding:28px 32px;"><img src="https://1smartpocket.com/assets/images/app_logo.png" alt="Smart Pocket logo" style="max-width:180px;height:auto;display:block;" /></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 12px;font-size:28px;">Sign-in method removed</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.7;">A sign-in method was removed from your Smart Pocket account.</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b6b82;">If you made this change, no action is required.</p><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b82;">If this was unexpected, review your account immediately at <a href="{{ .SiteURL }}" style="color:#0f3460;">{{ .SiteURL }}</a>.</p></td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#5b6b82;"><a href="https://1smartpocket.com" style="color:#0f3460;">https://1smartpocket.com</a><br />© Smart Pocket. All rights reserved.</td></tr>
    </table>
  </body>
</html>
```

## Supported Variable Checklist

Only use Supabase-supported placeholders when editing these templates:

- `{{ .ConfirmationURL }}`
- `{{ .Token }}`
- `{{ .TokenHash }}`
- `{{ .SiteURL }}`
- `{{ .Email }}`

Do not introduce custom placeholders.

## DNS Readiness Checklist

- SPF: authorize the final sending provider for `1smartpocket.com`
- DKIM: enable and verify provider DKIM signing for the production sender domain
- DMARC: publish a DMARC policy for reporting and enforcement
- Sender domain: confirm `no-reply@1smartpocket.com` is valid and accepted by the provider
- Reply-to: confirm reply handling for `info@1smartpocket.com`
- Bounce testing: send to a controlled invalid address and verify bounce handling/reporting

## Testing Checklist

- Paste each finalized template into `Authentication -> Email Templates`
- Confirm the Supabase project Site URL is `https://1smartpocket.com`
- Send real confirm-signup, password-reset, magic-link, invite, and change-email flows
- Verify all CTA links open the correct production domain
- Verify there is no Supabase branding, temporary domain, or development URL in rendered emails
- Verify the uploaded logo loads publicly over HTTPS
- Verify the sender is `Smart Pocket <no-reply@1smartpocket.com>`
- Verify reply-to and support references use `info@1smartpocket.com`

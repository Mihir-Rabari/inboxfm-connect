# Security

We consider the security of this project a top priority. But no matter how much effort we put into it, vulnerabilities can still exist.

If you discover a vulnerability, we'd like to know about it so we can address it as quickly as possible.

## Reporting a vulnerability

- Report privately via the **Security** tab of this repository: [Report a vulnerability](https://github.com/Mihir-Rabari/inboxfm-connect/security/advisories/new). Do not open a public issue for a vulnerability.
- Do not run automated scanners against any deployment you don't own or control.
- Do not exploit the vulnerability beyond what's needed to demonstrate it — don't access, download, or modify data that isn't yours.
- Use your own test account and test data when investigating; don't target other users' accounts or data.
- If you encounter personal data belonging to others while investigating, stop immediately, don't store or share it, and mention it in your report.
- Don't disclose the issue publicly until it's resolved.
- Provide enough detail to reproduce the problem (affected component, steps, and impact).

## Out of scope

- Clickjacking on pages with no sensitive actions.
- Unauthenticated/logout/login CSRF.
- Attacks requiring MITM or physical access to a user's device.
- Any activity that could disrupt the service (DoS).
- Content spoofing/text injection without a demonstrated attack vector (no HTML/CSS control).
- Email spoofing.
- Missing DNSSEC, CAA, or CSP headers.
- Lack of `Secure`/`HttpOnly` flags on non-sensitive cookies.
- Dead links.
- `UNSANDBOXED` execution mode — intended for trusted-operator deployments only, and blocked in EE/Cloud production.
- Input fields accepting special characters without a demonstrated exploitable sink.
- Capability-token endpoints (resume URLs, webhook URLs, signed file URLs) — the token *is* the authorization. Reports must demonstrate an actual disclosure path (logging, `Referer` leakage, weak entropy), not just "the token is a secret in the URL."
- Findings whose only attack path is guessing a high-entropy identifier (e.g. a nanoid) with no demonstrated disclosure source.

## What we aim to do

- Acknowledge your report and give an initial assessment on a best-effort basis.
- Not pursue legal action against reports made in good faith that follow the guidance above.
- Handle reports confidentially and not share your personal details with third parties without permission.
- Keep you informed as we work toward a fix.
- Credit you as the discoverer in any public write-up, unless you'd rather stay anonymous.

This is a small, actively-developed fork — we don't currently run a formal bug bounty program. Good-faith security reports are still very welcome and will be taken seriously.

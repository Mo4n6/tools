/**
 * Regression tests for the Dead Letter header analysis.
 *
 * The tool ships as one self-contained HTML file, so these drive the real published page:
 * jsdom loads `public/dead-letter.html`, runs its inline script, and the tests call the
 * same `DL` API the UI calls. That way a change to the shipped file cannot pass the suite
 * while the downloaded copy misbehaves.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type AuthResult = { method: string; result: string; props: Record<string, string> };

type Alignment = {
  fromDomain: string;
  dkimDomain: string;
  spfDomain: string;
  dkimAligned: boolean | null;
  spfAligned: boolean | null;
  computed: string | null;
};

type Auth = {
  ar: Array<{ authserv: string; kind: string; trusted?: boolean }>;
  trustedIndex: number;
  pinnedMissing: boolean;
  spf: AuthResult | null;
  dkim: AuthResult | null;
  dmarc: AuthResult | null;
  spfAll: AuthResult[];
  dkimAll: AuthResult[];
  alignment: Alignment;
};

type Finding = { sev: 'high' | 'medium' | 'info'; title: string; detail: string; ref: string };

type Message = { analysis: { auth: Auth; findings: Finding[] } };

type DeadLetter = {
  orgDomain(domain: string): string;
  TWO_LEVEL: string[];
  parseEml(bytes: Uint8Array, name: string): Message;
  analyzeMessage(msg: Message, opts: { DOMParser: unknown; authserv?: string }): void;
  buildReport(msg: Message): string;
};

const repoFile = (relativePath: string): string => fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
const fixture = (name: string): string => readFileSync(repoFile(`src/features/dead-letter/__fixtures__/${name}`), 'utf8');

const GATEWAY = 'mx.yourcompany.com';

let DL: DeadLetter;
let domParser: unknown;
let toBytes: (text: string) => Uint8Array;

beforeAll(() => {
  const dom = new JSDOM(readFileSync(repoFile('public/dead-letter.html'), 'utf8'), {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(win) {
      // jsdom ships no TextDecoder/TextEncoder; the page uses them to decode message bytes.
      const globals = win as unknown as Record<string, unknown>;
      globals.TextDecoder = TextDecoder;
      globals.TextEncoder = TextEncoder;
    },
  });
  const win = dom.window as unknown as { DL: DeadLetter; DOMParser: unknown; Uint8Array: Uint8ArrayConstructor };
  DL = win.DL;
  domParser = win.DOMParser;
  toBytes = (text) => new win.Uint8Array(Buffer.from(text, 'utf8'));
});

const analyze = (fixtureName: string, authserv?: string): Message => {
  const msg = DL.parseEml(toBytes(fixture(fixtureName)), fixtureName);
  DL.analyzeMessage(msg, { DOMParser: domParser, authserv });
  return msg;
};

const titles = (msg: Message, sev: Finding['sev']): string[] =>
  msg.analysis.findings.filter((f) => f.sev === sev).map((f) => f.title);

describe('DL.orgDomain', () => {
  it('separates senders under a registry suffix the bundled list omits', () => {
    expect(DL.orgDomain('evil.co.ke')).toBe('evil.co.ke');
    expect(DL.orgDomain('victim.co.ke')).toBe('victim.co.ke');
    expect(DL.orgDomain('evil.co.ke')).not.toBe(DL.orgDomain('victim.co.ke'));
    expect(DL.orgDomain('a.co.th')).not.toBe(DL.orgDomain('b.co.th'));
  });

  it('keeps listed suffixes and plain domains working', () => {
    expect(DL.orgDomain('mail.example.com')).toBe('example.com');
    expect(DL.orgDomain('a.b.example.co.uk')).toBe('example.co.uk');
    expect(DL.orgDomain('example.com')).toBe('example.com');
    expect(DL.orgDomain('')).toBe('');
  });

  it('does not split a provider domain whose label only looks like a suffix', () => {
    // "web" is deliberately absent from the marker list: web.de is registrable, so
    // mail.web.de and web.de must still compare as the same organization.
    expect(DL.orgDomain('mail.web.de')).toBe('web.de');
  });

  it('keeps single-organization domains whole while splitting real registry suffixes', () => {
    // mod.uk is one organization's domain, so a subdomain signature is still aligned.
    // nhs.uk and police.uk are registry suffixes that separate bodies register under,
    // so two names below them are different organizations.
    expect(DL.orgDomain('mail.mod.uk')).toBe('mod.uk');
    expect(DL.orgDomain('mail.mod.uk')).toBe(DL.orgDomain('mod.uk'));
    expect(DL.orgDomain('a.nhs.uk')).toBe('a.nhs.uk');
    expect(DL.orgDomain('a.nhs.uk')).not.toBe(DL.orgDomain('b.nhs.uk'));
    expect(DL.orgDomain('a.police.uk')).not.toBe(DL.orgDomain('b.police.uk'));
  });
});

describe('pinned authserv-id', () => {
  it('withholds verdicts rather than trusting a header the sender could have forged', () => {
    const { analysis } = analyze('case1-forged-ar.eml', GATEWAY);
    expect(analysis.auth.pinnedMissing).toBe(true);
    expect(analysis.auth.trustedIndex).toBe(-1);
    expect(analysis.auth.spf).toBeNull();
    expect(analysis.auth.dkim).toBeNull();
    expect(analysis.auth.dmarc).toBeNull();
    expect(analysis.auth.alignment.computed).toBeNull();
    expect(titles({ analysis } as Message, 'medium')).toContain(`No Authentication-Results from your gateway (${GATEWAY})`);
  });

  it('keeps the forged header visible but marked unused', () => {
    const { analysis } = analyze('case1-forged-ar.eml', GATEWAY);
    expect(analysis.auth.ar).toHaveLength(1);
    expect(analysis.auth.ar[0]?.authserv).toBe('attacker.example');
    expect(analysis.auth.ar[0]?.trusted).toBeUndefined();
  });

  it('says so in the exported report instead of quoting the untrusted verdicts', () => {
    const report = DL.buildReport(analyze('case1-forged-ar.eml', GATEWAY));
    expect(report).toContain('Authentication: withheld.');
    expect(report).not.toContain('Authentication (attacker.example)');
    expect(report).not.toContain('Alignment with From domain');
  });

  it('still falls back to the topmost header when no gateway is pinned', () => {
    const { analysis } = analyze('case1-forged-ar.eml');
    expect(analysis.auth.pinnedMissing).toBe(false);
    expect(analysis.auth.trustedIndex).toBe(0);
    expect(analysis.auth.dmarc?.result).toBe('pass');
  });

  it('uses the pinned gateway when it did stamp the message', () => {
    const { analysis } = analyze('case3-two-dkim.eml', GATEWAY);
    expect(analysis.auth.pinnedMissing).toBe(false);
    expect(analysis.auth.ar[analysis.auth.trustedIndex]?.authserv).toBe(GATEWAY);
  });
});

describe('organizational alignment', () => {
  it('reports a sender under a shared registry suffix as misaligned', () => {
    const msg = analyze('case2-cc-suffix.eml', GATEWAY);
    expect(msg.analysis.auth.alignment.dkimAligned).toBe(false);
    expect(msg.analysis.auth.alignment.computed).toBe('fail');
    expect(titles(msg, 'high')).toContain('Authenticated domain does not match the From domain');
  });
});

describe('wildcard registry suffixes', () => {
  it('separates two names under the same wildcard suffix', () => {
    // The Public Suffix List governs sch.uk with a wildcard, so hampshire.sch.uk is itself
    // a suffix and two schools below it are unrelated organizations.
    expect(DL.orgDomain('a.hampshire.sch.uk')).toBe('a.hampshire.sch.uk');
    expect(DL.orgDomain('a.hampshire.sch.uk')).not.toBe(DL.orgDomain('b.hampshire.sch.uk'));
    expect(DL.orgDomain('hampshire.sch.uk')).toBe('hampshire.sch.uk');
    expect(DL.orgDomain('mail.a.hampshire.sch.uk')).toBe('a.hampshire.sch.uk');
  });

  it('reports a signature from a sibling school as a mismatch', () => {
    const msg = analyze('case7-wildcard-suffix.eml', GATEWAY);
    expect(msg.analysis.auth.alignment.dkimAligned).toBe(false);
    expect(titles(msg, 'high')).toContain('Authenticated domain does not match the From domain');
  });
});

describe('names the suffix list says are registrable', () => {
  it('treats a subdomain of a registrable name as the same organization', () => {
    // co.de and edu.cy look like registry suffixes but are not, so a subdomain signature
    // is relaxed-aligned and must not be reported as a mismatch.
    expect(DL.orgDomain('mail.co.de')).toBe('co.de');
    expect(DL.orgDomain('mail.edu.cy')).toBe('edu.cy');
    expect(DL.TWO_LEVEL).not.toContain('co.de');
    expect(DL.TWO_LEVEL).not.toContain('edu.cy');
  });

  it('does not accuse a sender below a registrable name', () => {
    for (const name of ['case8-unproven-suffix.eml', 'case10-listed-suffix-as-from.eml']) {
      const msg = analyze(name, GATEWAY);
      expect(msg.analysis.auth.alignment.dkimAligned).toBe(true);
      expect(msg.analysis.auth.alignment.computed).toBe('pass');
      expect(titles(msg, 'high')).not.toContain('Authenticated domain does not match the From domain');
    }
  });

  it('picks the aligned signature when another passing one is unrelated', () => {
    // Two passing signatures, one for an unrelated domain and one below the From domain.
    const msg = analyze('case9-ambiguous-dkim.eml', GATEWAY);
    expect(msg.analysis.auth.dkim?.props['header.d']).toBe('mail.co.de');
    expect(msg.analysis.auth.alignment.dkimAligned).toBe(true);
    expect(titles(msg, 'high')).not.toContain('Authenticated domain does not match the From domain');
  });

  it('still calls a verified mismatch a mismatch', () => {
    // co.ke is a real registry suffix, so two names below it are different organizations.
    expect(DL.TWO_LEVEL).toContain('co.ke');
    const msg = analyze('case2-cc-suffix.eml', GATEWAY);
    expect(titles(msg, 'high')).toContain('Authenticated domain does not match the From domain');
  });
});

describe('single-organization domains', () => {
  it('does not report a subdomain signature as misaligned', () => {
    const msg = analyze('case6-single-org-suffix.eml', GATEWAY);
    expect(msg.analysis.auth.alignment.dkimAligned).toBe(true);
    expect(msg.analysis.auth.alignment.computed).toBe('pass');
    expect(titles(msg, 'high')).not.toContain('Authenticated domain does not match the From domain');
  });
});

describe('SPF identity precedence', () => {
  it('never prefers a passing HELO result over a MAIL FROM failure', () => {
    // DMARC evaluates RFC5321.MailFrom and uses the HELO identity only for a null reverse
    // path, so a forged "spf=pass smtp.helo=..." must not suppress the MAIL FROM failure.
    const msg = analyze('case4-spf-helo.eml', GATEWAY);
    expect(msg.analysis.auth.spfAll).toHaveLength(2);
    expect(msg.analysis.auth.spf?.result).toBe('fail');
    expect(msg.analysis.auth.spf?.props['smtp.mailfrom']).toBe('attacker.example');
    expect(msg.analysis.auth.alignment.spfAligned).toBeNull();
    expect(msg.analysis.auth.alignment.computed).toBe('fail');
    expect(titles(msg, 'high')).toContain('SPF fail for attacker.example');
    expect(titles(msg, 'high')).toContain('Authenticated domain does not match the From domain');
  });

  it('still uses the HELO identity when it is the only one evaluated', () => {
    const msg = analyze('case5-spf-helo-only.eml', GATEWAY);
    expect(msg.analysis.auth.spf?.result).toBe('pass');
    expect(msg.analysis.auth.spf?.props['smtp.helo']).toBe('mail.sender.example');
    expect(msg.analysis.auth.alignment.spfAligned).toBe(true);
    expect(msg.analysis.auth.alignment.computed).toBe('pass');
  });

  it('lists every SPF result so the discarded clause stays visible', () => {
    const msg = analyze('case4-spf-helo.eml', GATEWAY);
    const note = msg.analysis.findings.find((f) => f.title === '2 SPF results in the trusted header');
    expect(note?.detail).toContain('mailfrom=attacker.example');
    expect(note?.detail).toContain('helo=sender.example');
  });
});

describe('multiple DKIM results', () => {
  it('prefers the passing signature that aligns with the From domain', () => {
    const msg = analyze('case3-two-dkim.eml', GATEWAY);
    expect(msg.analysis.auth.dkimAll).toHaveLength(2);
    expect(msg.analysis.auth.dkim?.props['header.d']).toBe('realsender.com');
    expect(msg.analysis.auth.alignment.dkimAligned).toBe(true);
    expect(msg.analysis.auth.alignment.computed).toBe('pass');
  });

  it('does not raise a misalignment finding on platform-signed mail', () => {
    const msg = analyze('case3-two-dkim.eml', GATEWAY);
    expect(titles(msg, 'high')).not.toContain('Authenticated domain does not match the From domain');
  });

  it('lists every signature so preferring one never hides the others', () => {
    const msg = analyze('case3-two-dkim.eml', GATEWAY);
    const note = msg.analysis.findings.find((f) => f.title === '2 DKIM results in the trusted header');
    expect(note?.sev).toBe('info');
    expect(note?.detail).toContain('d=mailchimp.example');
    expect(note?.detail).toContain('d=realsender.com');
  });
});
